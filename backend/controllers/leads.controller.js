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
const projection = `l.*, l.next_contact_date::text AS next_contact_date,
 (l.next_contact_date<CURRENT_DATE AND l.status IN ('new','contacting','qualified')) AS overdue,
 ai.score AS ai_score,ai.intent AS ai_intent,ai.urgency AS ai_urgency,ai.summary AS ai_summary,
 ai.next_action AS ai_next_action,ai.response_draft AS ai_response_draft,ai.created_at AS ai_analyzed_at`;
const aiJoin = `LEFT JOIN LATERAL (SELECT * FROM lead_ai_analyses a WHERE a.lead_id=l.id ORDER BY a.id DESC LIMIT 1) ai ON TRUE`;
function errorResponse(res, e) {
  if (!e.status) console.error("Erro em leads:", e.code || e.message);
  res.status(e.status || 500).json({
    error: e.status
      ? e.message
      : "Não foi possível concluir a operação de leads.",
  });
}
function optionalId(value) {
  if (value == null || value === "") return null;
  if (!validId(value)) throw fail(400, "Veículo ou cliente inválido.");
  return Number(value);
}
function validate(b) {
  const [name, phone, email, city, notes] = validateCustomer(b);
  if (!phone && !email)
    throw fail(400, "Informe telefone ou e-mail para contato.");
  if (!sources.includes(b.source)) throw fail(400, "Origem inválida.");
  const budget = b.budget == null || b.budget === "" ? null : b.budget;
  if (budget !== null && !money(budget)) throw fail(400, "Orçamento inválido.");
  const next = b.next_contact_date || null;
  if (next !== null && !validDate(next))
    throw fail(400, "Data de retorno inválida.");
  return {
    name,
    phone,
    email,
    city,
    notes,
    source: b.source,
    vehicle_id: optionalId(b.vehicle_id),
    budget,
    next,
  };
}
async function event(client, id, type, content, user) {
  await client.query(
    "INSERT INTO lead_events(lead_id,event_type,content,created_by) VALUES($1,$2,$3,$4)",
    [id, type, content, user],
  );
}
async function locked(client, req) {
  if (!validId(req.params.id) || !validId(req.body?.version))
    throw fail(400, "Lead ou versão inválida.");
  const lead = (
    await client.query("SELECT * FROM leads WHERE id=$1 FOR UPDATE", [
      req.params.id,
    ])
  ).rows[0];
  if (!lead) throw fail(404, "Lead não encontrado.");
  if (lead.version !== Number(req.body.version))
    throw fail(
      409,
      "Este lead foi atualizado. Reabra a ficha antes de continuar.",
    );
  return lead;
}
async function listLeads(req, res) {
  try {
    res.json({
      leads: (
        await pool.query(
          `SELECT ${projection} FROM leads l ${aiJoin} ORDER BY l.created_at DESC,l.id DESC`,
        )
      ).rows,
    });
  } catch (e) {
    errorResponse(res, e);
  }
}
async function leadDetails(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Lead inválido.");
    const lead = (
      await pool.query(
        `SELECT ${projection} FROM leads l ${aiJoin} WHERE l.id=$1`,
        [req.params.id],
      )
    ).rows[0];
    if (!lead) throw fail(404, "Lead não encontrado.");
    const events = (
      await pool.query(
        "SELECT * FROM lead_events WHERE lead_id=$1 ORDER BY id DESC",
        [lead.id],
      )
    ).rows;
    res.json({ lead, events });
  } catch (e) {
    errorResponse(res, e);
  }
}
async function saveLead(req, res) {
  try {
    const b = validate(req.body || {}),
      editing = req.params.id !== undefined;
    const lead = await transaction(async (client) => {
      let old = null;
      if (editing) {
        old = await locked(client, req);
        if (["converted", "lost"].includes(old.status))
          throw fail(
            409,
            "Lead encerrado. Reabra um lead perdido antes de editar.",
          );
      }
      let vehicleLabel = null;
      if (b.vehicle_id !== null) {
        const vehicle = (
          await client.query(
            "SELECT id,brand,model,year FROM vehicles WHERE id=$1 FOR KEY SHARE",
            [b.vehicle_id],
          )
        ).rows[0];
        if (!vehicle) throw fail(404, "Veículo não encontrado.");
        vehicleLabel = `${vehicle.brand} ${vehicle.model} • ${vehicle.year}`;
      }
      const values = [
        b.name,
        b.phone,
        b.email,
        b.city,
        b.source,
        b.vehicle_id,
        vehicleLabel,
        b.budget,
        b.next,
        b.notes,
      ];
      const r = editing
        ? await client.query(
            `UPDATE leads SET name=$1,phone=$2,email=$3,city=$4,source=$5,vehicle_id=$6,vehicle_label=$7,budget=$8,next_contact_date=$9,notes=$10,version=version+1,updated_at=NOW() WHERE id=$11 RETURNING *`,
            [...values, old.id],
          )
        : await client.query(
            `INSERT INTO leads(name,phone,email,city,source,vehicle_id,vehicle_label,budget,next_contact_date,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [...values, req.user.sub],
          );
      await event(
        client,
        r.rows[0].id,
        editing ? "updated" : "created",
        editing ? "Dados do lead atualizados." : "Lead cadastrado.",
        req.user.sub,
      );
      return r.rows[0];
    });
    res.status(editing ? 200 : 201).json({ lead });
  } catch (e) {
    errorResponse(res, e);
  }
}
async function changeStage(req, res) {
  try {
    const target = req.body?.status;
    await transaction(async (client) => {
      const lead = await locked(client, req);
      if (!states[lead.status]?.includes(target))
        throw fail(409, "Mudança de etapa não permitida.");
      const reason =
        target === "lost" ? textValue(req.body.reason, 500, true) : null;
      await client.query(
        "UPDATE leads SET status=$2,loss_reason=$3,version=version+1,updated_at=NOW() WHERE id=$1",
        [lead.id, target, reason],
      );
      await event(
        client,
        lead.id,
        "stage_changed",
        `${labels[lead.status]} → ${labels[target]}${reason ? ": " + reason : ""}`,
        req.user.sub,
      );
    });
    res.json({ message: "Etapa atualizada." });
  } catch (e) {
    errorResponse(res, e);
  }
}
async function addNote(req, res) {
  try {
    const content = textValue(req.body?.content, 2000, true);
    await transaction(async (client) => {
      const lead = await locked(client, req);
      await event(client, lead.id, "note", content, req.user.sub);
      await client.query(
        "UPDATE leads SET version=version+1,updated_at=NOW() WHERE id=$1",
        [lead.id],
      );
    });
    res.status(201).json({ message: "Atendimento registrado." });
  } catch (e) {
    errorResponse(res, e);
  }
}
async function convertLead(req, res) {
  try {
    const existing = optionalId(req.body?.customer_id);
    const result = await transaction(async (client) => {
      const lead = await locked(client, req);
      if (lead.status !== "qualified")
        throw fail(409, "Qualifique o lead antes de converter.");
      let customer;
      if (existing !== null) {
        customer = (
          await client.query("SELECT * FROM customers WHERE id=$1 FOR SHARE", [
            existing,
          ])
        ).rows[0];
        if (!customer || !customer.is_active)
          throw fail(409, "Cliente indisponível. Selecione um cadastro ativo.");
      } else {
        customer = (
          await client.query(
            "INSERT INTO customers(name,phone,email,city,notes,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [
              lead.name,
              lead.phone,
              lead.email,
              lead.city,
              lead.notes,
              req.user.sub,
            ],
          )
        ).rows[0];
      }
      await client.query(
        "UPDATE leads SET status='converted',customer_id=$2,version=version+1,updated_at=NOW() WHERE id=$1",
        [lead.id, customer.id],
      );
      await event(
        client,
        lead.id,
        "converted",
        `Convertido e vinculado ao cliente #${customer.id}.`,
        req.user.sub,
      );
      return { customer_id: customer.id };
    });
    res.status(201).json(result);
  } catch (e) {
    errorResponse(res, e);
  }
}
async function analyzeLeadNow(req, res) {
  try {
    if (!validId(req.params.id)) throw fail(400, "Lead inválido.");
    const analysis = await analyzeLead(Number(req.params.id), req.user.sub);
    await pool.query(
      "INSERT INTO lead_events(lead_id,event_type,content,created_by) VALUES($1,'ai_analysis','IA analisou o lead e preparou uma sugestão.',$2)",
      [req.params.id, req.user.sub],
    );
    res.status(201).json({ analysis });
  } catch (e) {
    errorResponse(res, e);
  }
}
module.exports = {
  listLeads,
  leadDetails,
  saveLead,
  changeStage,
  addNote,
  convertLead,
  analyzeLeadNow,
};
