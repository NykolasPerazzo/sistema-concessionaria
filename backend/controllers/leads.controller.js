const pool = require("../database/connection");

const {
  transaction,
  validId,
  validDate,
  money,
  textValue,
  fail,
} = require("./sales.controller");

const { validateCustomer } = require("./customers.controller");

const { analyzeLead } = require("../services/lead-ai.service");

const {
  subscribe,
  notifyNewLead,
} = require("../services/lead-notifications.service");

const sources = [
  "website",
  "whatsapp",
  "instagram",
  "facebook",
  "referral",
  "walkin",
  "other",
];

const states = {
  new: ["contacting", "qualified", "lost"],
  contacting: ["qualified", "lost"],
  qualified: ["contacting", "lost"],
  lost: ["new"],
};

const labels = {
  new: "Novo",
  contacting: "Em atendimento",
  qualified: "Qualificado",
  lost: "Perdido",
  converted: "Convertido",
};

const projection = `
  l.*,
  l.next_contact_date::text AS next_contact_date,

  (
    l.next_contact_date < CURRENT_DATE
    AND l.status IN ('new', 'contacting', 'qualified')
  ) AS overdue,

  ai.score AS ai_score,
  ai.intent AS ai_intent,
  ai.urgency AS ai_urgency,
  ai.summary AS ai_summary,
  ai.next_action AS ai_next_action,
  ai.response_draft AS ai_response_draft,
  ai.created_at AS ai_analyzed_at
`;

const aiJoin = `
  LEFT JOIN LATERAL (
    SELECT *
    FROM lead_ai_analyses a
    WHERE a.lead_id = l.id
    ORDER BY a.id DESC
    LIMIT 1
  ) ai ON TRUE
`;

function errorResponse(res, error) {
  if (!error.status) {
    console.error("Erro em leads:", error.code || error.message);
  }

  res.status(error.status || 500).json({
    error: error.status
      ? error.message
      : "Não foi possível concluir a operação de leads.",
  });
}

function optionalId(value) {
  if (value == null || value === "") {
    return null;
  }

  if (!validId(value)) {
    throw fail(400, "Veículo ou cliente inválido.");
  }

  return Number(value);
}

function validate(body) {
  const [name, phone, email, city, notes] = validateCustomer(body);

  if (!phone && !email) {
    throw fail(400, "Informe telefone ou e-mail para contato.");
  }

  if (!sources.includes(body.source)) {
    throw fail(400, "Origem inválida.");
  }

  const budget = body.budget == null || body.budget === "" ? null : body.budget;

  if (budget !== null && !money(budget)) {
    throw fail(400, "Orçamento inválido.");
  }

  const next = body.next_contact_date || null;

  if (next !== null && !validDate(next)) {
    throw fail(400, "Data de retorno inválida.");
  }

  return {
    name,
    phone,
    email,
    city,
    notes,
    source: body.source,
    vehicle_id: optionalId(body.vehicle_id),
    budget,
    next,
  };
}

async function event(client, id, type, content, user) {
  await client.query(
    `
      INSERT INTO lead_events(
        lead_id,
        event_type,
        content,
        created_by
      )
      VALUES($1, $2, $3, $4)
    `,
    [id, type, content, user],
  );
}

async function locked(client, req) {
  if (!validId(req.params.id) || !validId(req.body?.version)) {
    throw fail(400, "Lead ou versão inválida.");
  }

  const result = await client.query(
    `
      SELECT *
      FROM leads
      WHERE id = $1
      FOR UPDATE
    `,
    [req.params.id],
  );

  const lead = result.rows[0];

  if (!lead) {
    throw fail(404, "Lead não encontrado.");
  }

  if (lead.version !== Number(req.body.version)) {
    throw fail(
      409,
      "Este lead foi atualizado. Reabra a ficha antes de continuar.",
    );
  }

  return lead;
}

async function listLeads(req, res) {
  try {
    const result = await pool.query(`
      SELECT ${projection}
      FROM leads l
      ${aiJoin}
      ORDER BY l.created_at DESC, l.id DESC
    `);

    res.json({
      leads: result.rows,
    });
  } catch (error) {
    errorResponse(res, error);
  }
}

async function leadDetails(req, res) {
  try {
    if (!validId(req.params.id)) {
      throw fail(400, "Lead inválido.");
    }

    const leadResult = await pool.query(
      `
        SELECT ${projection}
        FROM leads l
        ${aiJoin}
        WHERE l.id = $1
      `,
      [req.params.id],
    );

    const lead = leadResult.rows[0];

    if (!lead) {
      throw fail(404, "Lead não encontrado.");
    }

    const eventsResult = await pool.query(
      `
        SELECT *
        FROM lead_events
        WHERE lead_id = $1
        ORDER BY id DESC
      `,
      [lead.id],
    );

    res.json({
      lead,
      events: eventsResult.rows,
    });
  } catch (error) {
    errorResponse(res, error);
  }
}

async function saveLead(req, res) {
  try {
    const body = validate(req.body || {});

    const editing = req.params.id !== undefined;

    const lead = await transaction(async (client) => {
      let oldLead = null;

      if (editing) {
        oldLead = await locked(client, req);

        if (["converted", "lost"].includes(oldLead.status)) {
          throw fail(
            409,
            "Lead encerrado. Reabra um lead perdido antes de editar.",
          );
        }
      }

      let vehicleLabel = null;

      if (body.vehicle_id !== null) {
        const vehicleResult = await client.query(
          `
                SELECT
                  id,
                  brand,
                  model,
                  year
                FROM vehicles
                WHERE id = $1
                FOR KEY SHARE
              `,
          [body.vehicle_id],
        );

        const vehicle = vehicleResult.rows[0];

        if (!vehicle) {
          throw fail(404, "Veículo não encontrado.");
        }

        vehicleLabel =
          `${vehicle.brand} ` + `${vehicle.model} • ` + `${vehicle.year}`;
      }

      const values = [
        body.name,
        body.phone,
        body.email,
        body.city,
        body.source,
        body.vehicle_id,
        vehicleLabel,
        body.budget,
        body.next,
        body.notes,
      ];

      let result;

      if (editing) {
        result = await client.query(
          `
              UPDATE leads
              SET
                name = $1,
                phone = $2,
                email = $3,
                city = $4,
                source = $5,
                vehicle_id = $6,
                vehicle_label = $7,
                budget = $8,
                next_contact_date = $9,
                notes = $10,
                version = version + 1,
                updated_at = NOW()
              WHERE id = $11
              RETURNING *
            `,
          [...values, oldLead.id],
        );
      } else {
        result = await client.query(
          `
              INSERT INTO leads(
                name,
                phone,
                email,
                city,
                source,
                vehicle_id,
                vehicle_label,
                budget,
                next_contact_date,
                notes,
                created_by
              )
              VALUES(
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11
              )
              RETURNING *
            `,
          [...values, req.user.sub],
        );
      }

      const savedLead = result.rows[0];

      await event(
        client,
        savedLead.id,
        editing ? "updated" : "created",
        editing ? "Dados do lead atualizados." : "Lead cadastrado.",
        req.user.sub,
      );

      return savedLead;
    });

    /*
     * Só dispara a notificação quando
     * um lead novo for cadastrado.
     *
     * Edições não geram nova notificação.
     */
    if (!editing) {
      notifyNewLead(lead);
    }

    res.status(editing ? 200 : 201).json({ lead });
  } catch (error) {
    errorResponse(res, error);
  }
}

async function changeStage(req, res) {
  try {
    const target = req.body?.status;

    await transaction(async (client) => {
      const lead = await locked(client, req);

      if (!states[lead.status]?.includes(target)) {
        throw fail(409, "Mudança de etapa não permitida.");
      }

      const reason =
        target === "lost" ? textValue(req.body.reason, 500, true) : null;

      await client.query(
        `
          UPDATE leads
          SET
            status = $2,
            loss_reason = $3,
            version = version + 1,
            updated_at = NOW()
          WHERE id = $1
        `,
        [lead.id, target, reason],
      );

      const description =
        `${labels[lead.status]} → ` +
        `${labels[target]}` +
        `${reason ? `: ${reason}` : ""}`;

      await event(client, lead.id, "stage_changed", description, req.user.sub);
    });

    res.json({
      message: "Etapa atualizada.",
    });
  } catch (error) {
    errorResponse(res, error);
  }
}

async function addNote(req, res) {
  try {
    const content = textValue(req.body?.content, 2000, true);

    await transaction(async (client) => {
      const lead = await locked(client, req);

      await event(client, lead.id, "note", content, req.user.sub);

      await client.query(
        `
          UPDATE leads
          SET
            version = version + 1,
            updated_at = NOW()
          WHERE id = $1
        `,
        [lead.id],
      );
    });

    res.status(201).json({
      message: "Atendimento registrado.",
    });
  } catch (error) {
    errorResponse(res, error);
  }
}

async function convertLead(req, res) {
  try {
    const existingCustomerId = optionalId(req.body?.customer_id);

    const result = await transaction(async (client) => {
      const lead = await locked(client, req);

      if (lead.status !== "qualified") {
        throw fail(409, "Qualifique o lead antes de converter.");
      }

      let customer;

      if (existingCustomerId !== null) {
        const customerResult = await client.query(
          `
                SELECT *
                FROM customers
                WHERE id = $1
                FOR SHARE
              `,
          [existingCustomerId],
        );

        customer = customerResult.rows[0];

        if (!customer || !customer.is_active) {
          throw fail(409, "Cliente indisponível. Selecione um cadastro ativo.");
        }
      } else {
        const customerResult = await client.query(
          `
                INSERT INTO customers(
                  name,
                  phone,
                  email,
                  city,
                  notes,
                  created_by
                )
                VALUES(
                  $1,
                  $2,
                  $3,
                  $4,
                  $5,
                  $6
                )
                RETURNING *
              `,
          [
            lead.name,
            lead.phone,
            lead.email,
            lead.city,
            lead.notes,
            req.user.sub,
          ],
        );

        customer = customerResult.rows[0];
      }

      await client.query(
        `
            UPDATE leads
            SET
              status = 'converted',
              customer_id = $2,
              version = version + 1,
              updated_at = NOW()
            WHERE id = $1
          `,
        [lead.id, customer.id],
      );

      await event(
        client,
        lead.id,
        "converted",
        `Convertido e vinculado ao cliente #${customer.id}.`,
        req.user.sub,
      );

      return {
        customer_id: customer.id,
      };
    });

    res.status(201).json(result);
  } catch (error) {
    errorResponse(res, error);
  }
}

async function analyzeLeadNow(req, res) {
  try {
    if (!validId(req.params.id)) {
      throw fail(400, "Lead inválido.");
    }

    const analysis = await analyzeLead(Number(req.params.id), req.user.sub);

    await pool.query(
      `
        INSERT INTO lead_events(
          lead_id,
          event_type,
          content,
          created_by
        )
        VALUES(
          $1,
          'ai_analysis',
          'IA analisou o lead e preparou uma sugestão.',
          $2
        )
      `,
      [req.params.id, req.user.sub],
    );

    res.status(201).json({
      analysis,
    });
  } catch (error) {
    errorResponse(res, error);
  }
}

/*
 * Mantém uma conexão aberta entre
 * o backend e o dashboard.
 */
function leadEvents(req, res) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  if (res.flushHeaders) {
    res.flushHeaders();
  }

  /*
   * Confirma que o dashboard foi conectado.
   */
  res.write("event: connected\ndata: {}\n\n");

  const unsubscribe = subscribe(res);

  /*
   * Evita que hospedagens como o Render
   * encerrem a conexão por inatividade.
   */
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

module.exports = {
  listLeads,
  leadDetails,
  saveLead,
  changeStage,
  addNote,
  convertLead,
  analyzeLeadNow,
  leadEvents,
};
