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

const {
  computeScore,
  temperature,
} = require("../services/lead-score.service");

const sources = [
  "website",
  "whatsapp",
  "instagram",
  "facebook",
  "referral",
  "walkin",
  "other",
];

const paymentMethods = ["cash", "financing"];

const timeframes = [
  "immediate",
  "7_days",
  "30_days",
  "90_days",
  "research_only",
];

const preferenceKeys = [
  "profession",
  "family_profile",
  "vehicle_category",
  "min_year",
  "transmission",
  "fuel",
  "seats",
  "usage_purpose",
  "preferred_contact",
];

const interactionTypes = [
  "responded",
  "asked_photos",
  "asked_test_drive",
  "asked_simulation",
  "requested_proposal",
  "will_think_it_over",
  "stopped_responding",
  "meeting_scheduled",
  "lost_interest",
];

const interactionLabels = {
  responded: "Respondeu ao vendedor",
  asked_photos: "Pediu fotos",
  asked_test_drive: "Pediu test drive",
  asked_simulation: "Pediu simulação de financiamento",
  requested_proposal: "Solicitou proposta",
  will_think_it_over: "Disse que vai pensar",
  stopped_responding: "Deixou de responder",
  meeting_scheduled: "Marcou reunião",
  lost_interest: "Perdeu o interesse",
};

const paymentLabels = { cash: "à vista", financing: "financiado" };

const timeframeLabels = {
  immediate: "imediato",
  "7_days": "em até 7 dias",
  "30_days": "em até 30 dias",
  "90_days": "em até 90 dias",
  research_only: "ainda só pesquisando",
};

const temperatureLabels = { hot: "Quente", warm: "Morno", cold: "Frio" };

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
  ai.probable_objection AS ai_probable_objection,
  ai.advance_probability AS ai_advance_probability,
  ai.score_justification AS ai_score_justification,
  ai.created_at AS ai_analyzed_at,

  ai_err.created_at AS ai_error_at,
  ai_err.error_message AS ai_error_message,

  sc.score AS priority_score
`;

/*
 * Só considera a última análise que deu certo (status='ok'), para
 * uma tentativa que falhou depois não "apagar" a última análise boa
 * da tela. A falha mais recente vem à parte (ai_err) só para avisar.
 */
const aiJoin = `
  LEFT JOIN LATERAL (
    SELECT *
    FROM lead_ai_analyses a
    WHERE a.lead_id = l.id AND a.status = 'ok'
    ORDER BY a.id DESC
    LIMIT 1
  ) ai ON TRUE
  LEFT JOIN LATERAL (
    SELECT created_at, error_message
    FROM lead_ai_analyses e
    WHERE e.lead_id = l.id AND e.status = 'error'
    ORDER BY e.id DESC
    LIMIT 1
  ) ai_err ON TRUE
`;

/*
 * Pontuação de regras internas (não é IA). Usada tanto na listagem
 * (badge de prioridade) quanto na ficha do lead.
 */
const scoreJoin = `
  LEFT JOIN LATERAL (
    SELECT score
    FROM lead_scores s
    WHERE s.lead_id = l.id
    ORDER BY s.id DESC
    LIMIT 1
  ) sc ON TRUE
`;

/*
 * Resumo básico, gerado por regras/template (SEM IA). O resumo de IA
 * de fato é o campo ai_summary, calculado pelo Gemini em analyzeLead.
 */
function buildBasicSummary(lead) {
  const parts = [
    `Procura ${lead.vehicle_label || "veículo ainda não definido"}.`,
  ];

  if (lead.payment_method) {
    parts.push(`Pagamento: ${paymentLabels[lead.payment_method]}.`);
  }

  if (lead.purchase_timeframe) {
    parts.push(`Prazo: ${timeframeLabels[lead.purchase_timeframe]}.`);
  }

  const temp = temperature(lead.priority_score);

  parts.push(
    temp
      ? `Prioridade: ${temperatureLabels[temp]} (${lead.priority_score}/100).`
      : "Prioridade: ainda não avaliada.",
  );

  return parts.join(" ");
}

/*
 * Só mostra o aviso de falha quando ela é mais recente que a última
 * análise boa (senão uma tentativa antiga e já superada voltaria a
 * aparecer toda vez que a tela é aberta).
 */
function attachAiError(row) {
  const hasNewerError =
    row.ai_error_at &&
    (!row.ai_analyzed_at || new Date(row.ai_error_at) > new Date(row.ai_analyzed_at));

  row.ai_last_error = hasNewerError
    ? { message: row.ai_error_message, at: row.ai_error_at }
    : null;

  delete row.ai_error_at;
  delete row.ai_error_message;

  return row;
}

/*
 * Recalcula a pontuação de regras a partir dos dados atuais do lead
 * e das interações registradas. Só grava uma nova linha em
 * lead_scores quando o resultado muda, para não poluir o histórico.
 */
async function recomputeScore(client, leadId) {
  const leadResult = await client.query(
    `SELECT * FROM leads WHERE id = $1`,
    [leadId],
  );

  const lead = leadResult.rows[0];

  if (!lead) {
    return null;
  }

  const flagsResult = await client.query(
    `
      SELECT
        COALESCE(bool_or(interaction_type = 'asked_simulation'), false) AS asked_simulation,
        COALESCE(bool_or(interaction_type IN ('asked_test_drive', 'requested_proposal', 'meeting_scheduled')), false) AS engaged_action,
        COALESCE(bool_or(interaction_type = 'responded' AND created_at::date = CURRENT_DATE), false) AS responded_today
      FROM lead_events
      WHERE lead_id = $1 AND event_type = 'interaction'
    `,
    [leadId],
  );

  const flags = flagsResult.rows[0];

  const { score, reasons } = computeScore(lead, {
    askedSimulation: flags.asked_simulation,
    engagedAction: flags.engaged_action,
    respondedToday: flags.responded_today,
  });

  const lastResult = await client.query(
    `SELECT * FROM lead_scores WHERE lead_id = $1 ORDER BY id DESC LIMIT 1`,
    [leadId],
  );

  const last = lastResult.rows[0];

  if (
    last &&
    last.score === score &&
    JSON.stringify(last.reasons) === JSON.stringify(reasons)
  ) {
    return last;
  }

  const inserted = await client.query(
    `
      INSERT INTO lead_scores(lead_id, score, reasons)
      VALUES($1, $2, $3)
      RETURNING *
    `,
    [leadId, score, JSON.stringify(reasons)],
  );

  return inserted.rows[0];
}

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

function optionalMoney(value, label) {
  if (value == null || value === "") {
    return null;
  }

  if (!money(value)) {
    throw fail(400, `${label} inválido.`);
  }

  return value;
}

function optionalTri(value, label) {
  if (value == null || value === "") {
    return null;
  }

  if (value === true || value === "true" || value === "yes") {
    return true;
  }

  if (value === false || value === "false" || value === "no") {
    return false;
  }

  throw fail(400, `${label} inválido.`);
}

/*
 * Campos secundários e opcionais do perfil (só quando informados),
 * guardados como JSON em vez de uma coluna por campo. Chaves fora da
 * lista abaixo são recusadas para não virar um "campo livre" sem controle.
 */
function parsePreferences(input) {
  if (input == null || input === "") {
    return {};
  }

  let obj = input;

  if (typeof input === "string") {
    try {
      obj = JSON.parse(input);
    } catch {
      throw fail(400, "Preferências declaradas inválidas.");
    }
  }

  if (typeof obj !== "object" || Array.isArray(obj)) {
    throw fail(400, "Preferências declaradas inválidas.");
  }

  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value == null || value === "") {
      continue;
    }

    if (!preferenceKeys.includes(key)) {
      throw fail(400, `Preferência desconhecida: ${key}.`);
    }

    const str = String(value).trim().slice(0, 120);

    if (str) {
      result[key] = str;
    }
  }

  return result;
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

  const paymentMethod = body.payment_method || null;

  if (paymentMethod !== null && !paymentMethods.includes(paymentMethod)) {
    throw fail(400, "Forma de pagamento inválida.");
  }

  const purchaseTimeframe = body.purchase_timeframe || null;

  if (purchaseTimeframe !== null && !timeframes.includes(purchaseTimeframe)) {
    throw fail(400, "Prazo de compra inválido.");
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
    payment_method: paymentMethod,
    down_payment: optionalMoney(body.down_payment, "Valor de entrada"),
    desired_installment: optionalMoney(
      body.desired_installment,
      "Parcela desejada",
    ),
    has_trade_in: optionalTri(body.has_trade_in, "Veículo na troca"),
    trade_in_estimated_value: optionalMoney(
      body.trade_in_estimated_value,
      "Valor estimado da troca",
    ),
    financing_pre_approved: optionalTri(
      body.financing_pre_approved,
      "Financiamento pré-aprovado",
    ),
    purchase_timeframe: purchaseTimeframe,
    declared_preferences: parsePreferences(body.declared_preferences),
    assigned_to: optionalId(body.assigned_to),
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
      ${scoreJoin}
      ORDER BY l.created_at DESC, l.id DESC
    `);

    res.json({
      leads: result.rows.map((row) => {
        attachAiError(row);
        return { ...row, basic_summary: buildBasicSummary(row) };
      }),
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
        ${scoreJoin}
        WHERE l.id = $1
      `,
      [req.params.id],
    );

    const lead = leadResult.rows[0];

    if (!lead) {
      throw fail(404, "Lead não encontrado.");
    }

    attachAiError(lead);
    lead.basic_summary = buildBasicSummary(lead);

    const eventsResult = await pool.query(
      `
        SELECT *
        FROM lead_events
        WHERE lead_id = $1
        ORDER BY id DESC
      `,
      [lead.id],
    );

    const scoreResult = await pool.query(
      `
        SELECT *
        FROM lead_scores
        WHERE lead_id = $1
        ORDER BY id DESC
        LIMIT 1
      `,
      [lead.id],
    );

    const tasksResult = await pool.query(
      `
        SELECT *
        FROM lead_tasks
        WHERE lead_id = $1
        ORDER BY (status = 'open') DESC, due_date NULLS LAST, id DESC
      `,
      [lead.id],
    );

    const analysesResult = await pool.query(
      `
        SELECT
          id, status, score, intent, urgency, summary, next_action,
          response_draft, probable_objection, advance_probability,
          score_justification, model, prompt_version, error_message,
          created_at
        FROM lead_ai_analyses
        WHERE lead_id = $1
        ORDER BY id DESC
        LIMIT 10
      `,
      [lead.id],
    );

    res.json({
      lead,
      events: eventsResult.rows,
      score: scoreResult.rows[0] || null,
      tasks: tasksResult.rows,
      analyses: analysesResult.rows,
    });
  } catch (error) {
    errorResponse(res, error);
  }
}

async function saveLead(req, res) {
  try {
    const body = validate(req.body || {});

    const editing = req.params.id !== undefined;

    const saved = await transaction(async (client) => {
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

      if (body.assigned_to !== null) {
        const userResult = await client.query(
          `SELECT id FROM users WHERE id = $1 AND role IN ('admin', 'vendedor')`,
          [body.assigned_to],
        );

        if (!userResult.rows[0]) {
          throw fail(404, "Vendedor não encontrado.");
        }
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
        body.payment_method,
        body.down_payment,
        body.desired_installment,
        body.has_trade_in,
        body.trade_in_estimated_value,
        body.financing_pre_approved,
        body.purchase_timeframe,
        JSON.stringify(body.declared_preferences),
        body.assigned_to,
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
                payment_method = $11,
                down_payment = $12,
                desired_installment = $13,
                has_trade_in = $14,
                trade_in_estimated_value = $15,
                financing_pre_approved = $16,
                purchase_timeframe = $17,
                declared_preferences = $18,
                assigned_to = $19,
                version = version + 1,
                updated_at = NOW()
              WHERE id = $20
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
                payment_method,
                down_payment,
                desired_installment,
                has_trade_in,
                trade_in_estimated_value,
                financing_pre_approved,
                purchase_timeframe,
                declared_preferences,
                assigned_to,
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
                $11,
                $12,
                $13,
                $14,
                $15,
                $16,
                $17,
                $18,
                $19,
                $20
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

      const score = await recomputeScore(client, savedLead.id);

      return { lead: savedLead, score };
    });

    /*
     * Só dispara a notificação quando
     * um lead novo for cadastrado.
     *
     * Edições não geram nova notificação.
     */
    if (!editing) {
      notifyNewLead(saved.lead);
    }

    res
      .status(editing ? 200 : 201)
      .json({ lead: saved.lead, score: saved.score });
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

/*
 * Atribuição rápida de vendedor, sem precisar abrir o formulário
 * inteiro. assigned_to = null desatribui.
 */
async function assignLead(req, res) {
  try {
    const assignedTo = optionalId(req.body?.assigned_to);

    await transaction(async (client) => {
      const lead = await locked(client, req);

      let userName = null;

      if (assignedTo !== null) {
        const userResult = await client.query(
          `SELECT id, name FROM users WHERE id = $1 AND role IN ('admin', 'vendedor')`,
          [assignedTo],
        );

        if (!userResult.rows[0]) {
          throw fail(404, "Vendedor não encontrado.");
        }

        userName = userResult.rows[0].name;
      }

      await client.query(
        `
          UPDATE leads
          SET assigned_to = $2, version = version + 1, updated_at = NOW()
          WHERE id = $1
        `,
        [lead.id, assignedTo],
      );

      await event(
        client,
        lead.id,
        "assigned",
        assignedTo === null
          ? "Lead desatribuído."
          : `Atribuído a ${userName}.`,
        req.user.sub,
      );
    });

    res.json({
      message: "Atribuição atualizada.",
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

/*
 * Cadastro público de lead, feito pelo próprio
 * site (assistente de IA), sem autenticação.
 */
async function createPublicLead(req, res) {
  try {
    const body = req.body || {};

    const phone = textValue(body.phone, 30, true);

    if (
      !/^[+()\d\s.-]+$/.test(phone) ||
      phone.replace(/\D/g, "").length < 8 ||
      phone.replace(/\D/g, "").length > 15
    ) {
      throw fail(400, "Informe um telefone com 8 a 15 dígitos.");
    }

    const name = textValue(body.name, 120) || "Visitante do site";

    const budget = textValue(body.budget, 60);
    const usage = textValue(body.usage, 200);
    const priority = textValue(body.priority, 200);
    const aiAnswer = textValue(body.aiAnswer, 1500);

    const noteParts = [];

    if (budget) noteParts.push(`Orçamento: ${budget}`);
    if (usage) noteParts.push(`Uso principal: ${usage}`);
    if (priority) noteParts.push(`Prioridade: ${priority}`);
    if (aiAnswer) noteParts.push(`Recomendação da IA: ${aiAnswer}`);

    const notes = textValue(
      [
        "Lead gerado pelo assistente de IA do site.",
        ...noteParts,
      ].join("\n"),
      2000,
    );

    const lead = await transaction(async (client) => {
      const result = await client.query(
        `
          INSERT INTO leads(name, phone, source, notes, created_by)
          VALUES($1, $2, 'website', $3, 0)
          RETURNING *
        `,
        [name, phone, notes],
      );

      const savedLead = result.rows[0];

      await event(
        client,
        savedLead.id,
        "created",
        "Lead cadastrado pelo assistente de IA do site.",
        0,
      );

      return savedLead;
    });

    notifyNewLead(lead);

    res.status(201).json({
      message: "Recebemos seu contato. Em breve alguém vai te chamar.",
    });
  } catch (error) {
    errorResponse(res, error);
  }
}

/*
 * Trava simples em memória: impede que dois cliques (ou duas abas)
 * disparem duas análises do MESMO lead ao mesmo tempo. Não bloqueia
 * uma reanálise manual pedida depois que a anterior já terminou.
 */
const analyzingLeads = new Set();

async function analyzeLeadNow(req, res) {
  const leadId = Number(req.params.id);

  try {
    if (!validId(req.params.id)) {
      throw fail(400, "Lead inválido.");
    }

    if (analyzingLeads.has(leadId)) {
      throw fail(
        429,
        "Já existe uma análise em andamento para este lead. Aguarde terminar.",
      );
    }

    analyzingLeads.add(leadId);

    const analysis = await analyzeLead(leadId, req.user.sub);

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
  } finally {
    analyzingLeads.delete(leadId);
  }
}

/*
 * Registra uma interação de um tipo fixo (o que o vendedor observou
 * no atendimento), soma à timeline e recalcula a pontuação — algumas
 * interações (pedir simulação, test drive, proposta...) valem pontos.
 */
async function addInteraction(req, res) {
  try {
    const type = req.body?.type;

    if (!interactionTypes.includes(type)) {
      throw fail(400, "Tipo de interação inválido.");
    }

    const note = textValue(req.body?.note, 500);
    const label = interactionLabels[type];
    const content = note ? `${label}: ${note}` : label;

    const score = await transaction(async (client) => {
      const lead = await locked(client, req);

      await client.query(
        `
          INSERT INTO lead_events(lead_id, event_type, interaction_type, content, created_by)
          VALUES($1, 'interaction', $2, $3, $4)
        `,
        [lead.id, type, content, req.user.sub],
      );

      await client.query(
        `
          UPDATE leads
          SET version = version + 1, updated_at = NOW()
          WHERE id = $1
        `,
        [lead.id],
      );

      return recomputeScore(client, lead.id);
    });

    res.status(201).json({
      message: "Interação registrada.",
      score,
    });
  } catch (error) {
    errorResponse(res, error);
  }
}

/*
 * Tarefa/lembrete de retorno do lead. Não usa o controle de versão do
 * lead (locked()) porque é um registro à parte, não um campo do lead.
 */
async function createTask(req, res) {
  try {
    if (!validId(req.params.id)) {
      throw fail(400, "Lead inválido.");
    }

    const title = textValue(req.body?.title, 255, true);
    const dueDate = req.body?.due_date || null;

    if (dueDate !== null && !validDate(dueDate)) {
      throw fail(400, "Data da tarefa inválida.");
    }

    const leadCheck = await pool.query(`SELECT id FROM leads WHERE id = $1`, [
      req.params.id,
    ]);

    if (!leadCheck.rows[0]) {
      throw fail(404, "Lead não encontrado.");
    }

    const result = await pool.query(
      `
        INSERT INTO lead_tasks(lead_id, title, due_date, created_by)
        VALUES($1, $2, $3, $4)
        RETURNING *
      `,
      [req.params.id, title, dueDate, req.user.sub],
    );

    await pool.query(
      `
        INSERT INTO lead_events(lead_id, event_type, content, created_by)
        VALUES($1, 'task_created', $2, $3)
      `,
      [
        req.params.id,
        `Tarefa criada: ${title}${dueDate ? ` (até ${dueDate})` : ""}`,
        req.user.sub,
      ],
    );

    res.status(201).json({ task: result.rows[0] });
  } catch (error) {
    errorResponse(res, error);
  }
}

async function updateTask(req, res) {
  try {
    if (!validId(req.params.id) || !validId(req.params.taskId)) {
      throw fail(400, "Lead ou tarefa inválidos.");
    }

    const status = req.body?.status;

    if (!["done", "cancelled"].includes(status)) {
      throw fail(400, "Status de tarefa inválido.");
    }

    const taskResult = await pool.query(
      `SELECT * FROM lead_tasks WHERE id = $1 AND lead_id = $2`,
      [req.params.taskId, req.params.id],
    );

    const task = taskResult.rows[0];

    if (!task) {
      throw fail(404, "Tarefa não encontrada.");
    }

    if (task.status !== "open") {
      throw fail(409, "Esta tarefa já foi encerrada.");
    }

    const result = await pool.query(
      `
        UPDATE lead_tasks
        SET status = $1, completed_by = $2, completed_at = NOW()
        WHERE id = $3
        RETURNING *
      `,
      [status, req.user.sub, task.id],
    );

    await pool.query(
      `
        INSERT INTO lead_events(lead_id, event_type, content, created_by)
        VALUES($1, $2, $3, $4)
      `,
      [
        req.params.id,
        status === "done" ? "task_completed" : "task_cancelled",
        `${status === "done" ? "Tarefa concluída" : "Tarefa cancelada"}: ${task.title}`,
        req.user.sub,
      ],
    );

    res.json({ task: result.rows[0] });
  } catch (error) {
    errorResponse(res, error);
  }
}

/*
 * Recomputa a pontuação sob demanda (botão "Atualizar pontuação").
 * Não chama IA nem nenhum serviço externo — é só reaplicar as regras.
 */
async function recalculateScore(req, res) {
  try {
    if (!validId(req.params.id)) {
      throw fail(400, "Lead inválido.");
    }

    const leadCheck = await pool.query(`SELECT id FROM leads WHERE id = $1`, [
      req.params.id,
    ]);

    if (!leadCheck.rows[0]) {
      throw fail(404, "Lead não encontrado.");
    }

    const score = await recomputeScore(pool, Number(req.params.id));

    res.json({ score });
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
  assignLead,
  addNote,
  convertLead,
  analyzeLeadNow,
  leadEvents,
  createPublicLead,
  addInteraction,
  createTask,
  updateTask,
  recalculateScore,
};
