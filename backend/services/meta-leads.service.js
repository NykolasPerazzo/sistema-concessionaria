const pool = require("../database/connection");
const { analyzeLead } = require("./lead-ai.service");
function configured() {
  return Boolean(
    process.env.META_PAGE_ACCESS_TOKEN &&
    process.env.META_APP_SECRET &&
    process.env.META_WEBHOOK_VERIFY_TOKEN &&
    /^v\d+\.\d+$/.test(process.env.META_GRAPH_API_VERSION || ""),
  );
}
function fieldsToObject(items = []) {
  const result = {};
  for (const item of items)
    if (item && typeof item.name === "string")
      result[item.name] = Array.isArray(item.values)
        ? item.values.join(", ")
        : "";
  return result;
}
function first(data, names) {
  for (const name of names) if (data[name]) return String(data[name]).trim();
  return null;
}
async function importMetaLead(leadgenId, event = {}) {
  if (!configured()) throw new Error("Integração Meta não configurada.");
  const url = `https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION}/${encodeURIComponent(leadgenId)}?fields=id,created_time,field_data,ad_id,form_id`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.META_PAGE_ACCESS_TOKEN}` },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(`Meta Graph API recusou o lead (${response.status}).`);
  const data = fieldsToObject(body.field_data),
    name =
      first(data, ["full_name", "nome_completo", "name"]) ||
      "Lead Meta sem nome",
    phone = first(data, ["phone_number", "telefone", "phone"]),
    email = first(data, ["email"]);
  if (!phone && !email) throw new Error("Lead Meta sem telefone ou e-mail.");
  const city = first(data, ["city", "cidade"]),
    interest = first(data, [
      "vehicle",
      "car_model",
      "modelo",
      "qual_veiculo_voce_procura",
    ]),
    budgetRaw = first(data, ["budget", "orcamento", "orçamento"]),
    budget =
      budgetRaw && /^\d+(?:[.,]\d{1,2})?$/.test(budgetRaw.replace(/\s/g, ""))
        ? Number(budgetRaw.replace(",", "."))
        : null;
  const result = await pool.query(
    `INSERT INTO leads(name,phone,email,city,source,budget,interest_text,external_provider,external_lead_id,external_form_id,external_ad_id,imported_at,created_by,notes)
 VALUES($1,$2,$3,$4,'facebook',$5,$6,'meta_lead_ads',$7,$8,$9,NOW(),0,$10)
 ON CONFLICT(external_provider,external_lead_id) WHERE external_provider IS NOT NULL AND external_lead_id IS NOT NULL DO NOTHING RETURNING *`,
    [
      name,
      phone,
      email,
      city,
      budget,
      interest,
      leadgenId,
      body.form_id || event.form_id || null,
      body.ad_id || event.ad_id || null,
      "Importado automaticamente do Meta Lead Ads.",
    ],
  );
  if (!result.rows[0]) return { duplicate: true };
  const lead = result.rows[0];
  await pool.query(
    "INSERT INTO lead_events(lead_id,event_type,content,created_by) VALUES($1,'imported','Lead importado do Meta Lead Ads.',0)",
    [lead.id],
  );
  try { await analyzeLead(lead.id, null); }
  catch (e) { console.error("IA automática do lead falhou:", e.message); }
  return { duplicate: false, lead };
}
async function processEvent(id) {
  const event = (
    await pool.query(
      "UPDATE meta_webhook_events SET status='processing',attempts=attempts+1 WHERE id=$1 AND status IN ('pending','failed') RETURNING *",
      [id],
    )
  ).rows[0];
  if (!event) return;
  try {
    await importMetaLead(event.leadgen_id, event);
    await pool.query(
      "UPDATE meta_webhook_events SET status='processed',processed_at=NOW(),error_message=NULL WHERE id=$1",
      [id],
    );
  } catch (e) {
    await pool.query(
      "UPDATE meta_webhook_events SET status='failed',error_message=$2 WHERE id=$1",
      [id, String(e.message).slice(0, 1000)],
    );
  }
}
async function recoverPending() {
  await pool.query("UPDATE meta_webhook_events SET status='failed',error_message='Processamento interrompido pelo reinício do servidor.' WHERE status='processing'");
  const rows = (
    await pool.query(
      "SELECT id FROM meta_webhook_events WHERE status IN ('pending','failed') AND attempts<5 ORDER BY id LIMIT 100",
    )
  ).rows;
  for (const row of rows) await processEvent(row.id);
}
module.exports = { configured, processEvent, recoverPending };
