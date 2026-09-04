const crypto = require("node:crypto");
const pool = require("../database/connection");
const { configured, processEvent } = require("../services/meta-leads.service");
function verifyWebhook(req, res) {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === process.env.META_WEBHOOK_VERIFY_TOKEN
  )
    return res.status(200).send(String(req.query["hub.challenge"] || ""));
  return res.sendStatus(403);
}
function validSignature(req) {
  const header = req.get("x-hub-signature-256") || "",
    expected =
      "sha256=" +
      crypto
        .createHmac("sha256", process.env.META_APP_SECRET || "")
        .update(req.rawBody || Buffer.alloc(0))
        .digest("hex");
  const a = Buffer.from(header),
    b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function receiveWebhook(req, res) {
  if (!configured() || !validSignature(req)) return res.sendStatus(403);
  try {
    const ids = [];
    for (const entry of req.body?.entry || [])
      for (const change of entry.changes || []) {
        if (change.field !== "leadgen" || !change.value?.leadgen_id) continue;
        const v = change.value,
          key = `${entry.id || ""}:${v.leadgen_id}`;
        const row = (
          await pool.query(
            `INSERT INTO meta_webhook_events(external_event_key,leadgen_id,page_id,form_id,ad_id,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(external_event_key) DO NOTHING RETURNING id`,
            [
              key,
              String(v.leadgen_id),
              String(v.page_id || entry.id || ""),
              v.form_id ? String(v.form_id) : null,
              v.ad_id ? String(v.ad_id) : null,
              JSON.stringify({ entry_id: entry.id, change }),
            ],
          )
        ).rows[0];
        if (row) ids.push(row.id);
      }
    res.sendStatus(200);
    for (const id of ids)
      setImmediate(() =>
        processEvent(id).catch((e) =>
          console.error("Falha ao processar evento Meta:", e.message),
        ),
      );
  } catch (e) {
    console.error("Falha ao persistir webhook Meta:", e.message);
    res.sendStatus(500);
  }
}
function status(req, res) {
  res.json({
    configured: configured(),
    graphVersion: process.env.META_GRAPH_API_VERSION || null,
    webhookPath: "/api/integrations/meta/webhook",
    mode: "lead_ads",
    aiMode: "suggest_only",
  });
}
module.exports = { verifyWebhook, receiveWebhook, status };
