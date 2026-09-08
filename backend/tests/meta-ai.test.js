const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { fixture } = require("./helpers/sales-fixture");
test("Meta Lead Ads e IA: assinatura, deduplicação, importação e sugestões", async (t) => {
  const originalFetch = global.fetch;
  delete process.env.META_PAGE_ACCESS_TOKEN;
  delete process.env.META_APP_SECRET;
  delete process.env.META_WEBHOOK_VERIFY_TOKEN;
  delete process.env.META_GRAPH_API_VERSION;
  delete process.env.GEMINI_API_KEY;
  const f = await fixture();
  t.after(async () => {
    global.fetch = originalFetch;
    for (const key of [
      "META_PAGE_ACCESS_TOKEN",
      "META_APP_SECRET",
      "META_WEBHOOK_VERIFY_TOKEN",
      "META_GRAPH_API_VERSION",
      "GEMINI_API_KEY",
      "GEMINI_MODEL",
    ])
      delete process.env[key];
    await f.close();
  });
  await f.db.exec(
    `INSERT INTO vehicles(brand,model,year,price,purchase_price,entry_date,status) VALUES('Chevrolet','Onix Plus',2026,98000,82000,CURRENT_DATE-10,'available');`,
  );
  await t.test(
    "status não revela segredos e webhook fechado sem configuração",
    async () => {
      const status = await f.request("/api/integrations/meta/status");
      assert.equal(status.status, 200);
      assert.equal(status.data.configured, false);
      assert.equal("token" in status.data, false);
      const response = await originalFetch(
        f.url +
          "/api/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=123",
      );
      assert.equal(response.status, 403);
    },
  );
  process.env.META_PAGE_ACCESS_TOKEN = "page-token-test";
  process.env.META_APP_SECRET = "app-secret-test";
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-test";
  process.env.META_GRAPH_API_VERSION = "v99.0";
  process.env.GEMINI_API_KEY = "gemini-test";
  process.env.GEMINI_MODEL = "gemini-test-model";
  let graphCalls = 0,
    geminiCalls = 0;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.startsWith(f.url)) return originalFetch(url, options);
    if (target.includes("graph.facebook.com")) {
      graphCalls++;
      assert.equal(options.headers.Authorization, "Bearer page-token-test");
      return new Response(
        JSON.stringify({
          id: "lead-123",
          form_id: "form-1",
          ad_id: "ad-1",
          field_data: [
            { name: "full_name", values: ["Maria da Silva"] },
            { name: "phone_number", values: ["+5553999990000"] },
            { name: "email", values: ["maria@example.com"] },
            { name: "city", values: ["Rio Grande"] },
            { name: "vehicle", values: ["Onix Plus"] },
            { name: "budget", values: ["100000"] },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (target.includes("generativelanguage.googleapis.com")) {
      geminiCalls++;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      score: 82,
                      intent: "high",
                      urgency: "medium",
                      summary: "Interessada no Onix Plus e informou orçamento.",
                      next_action:
                        "Confirmar disponibilidade e forma de pagamento.",
                      response_draft:
                        "Olá, Maria! Posso ajudar com o Onix Plus e explicar as opções disponíveis.",
                      probable_objection:
                        "Pode achar o valor da parcela alto.",
                      advance_probability: "medium",
                      score_justification:
                        "Respondeu rápido e já tem um veículo específico em mente.",
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error("Rede inesperada no teste: " + target);
  };
  await t.test("verificação do callback", async () => {
    let r = await originalFetch(
      f.url +
        "/api/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=123",
    );
    assert.equal(r.status, 403);
    r = await originalFetch(
      f.url +
        "/api/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=123",
    );
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "123");
  });
  const payload = {
      object: "page",
      entry: [
        {
          id: "page-1",
          changes: [
            {
              field: "leadgen",
              value: {
                leadgen_id: "lead-123",
                page_id: "page-1",
                form_id: "form-1",
                ad_id: "ad-1",
              },
            },
          ],
        },
      ],
    },
    raw = JSON.stringify(payload),
    signature =
      "sha256=" +
      crypto.createHmac("sha256", "app-secret-test").update(raw).digest("hex");
  await t.test("assinatura inválida não importa", async () => {
    const r = await originalFetch(f.url + "/api/integrations/meta/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=bad",
      },
      body: raw,
    });
    assert.equal(r.status, 403);
    assert.equal(
      (await f.db.query("SELECT COUNT(*) FROM leads")).rows[0].count,
      0,
    );
  });
  await t.test("evento válido importa uma vez e dispara IA", async () => {
    for (let i = 0; i < 2; i++) {
      const r = await originalFetch(f.url + "/api/integrations/meta/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": signature,
        },
        body: raw,
      });
      assert.equal(r.status, 200);
    }
    for (let i = 0; i < 80; i++) {
      if (
        Number(
          (await f.db.query("SELECT COUNT(*) FROM lead_ai_analyses")).rows[0]
            .count,
        ) === 1
      )
        break;
      await new Promise((r) => setTimeout(r, 25));
    }
    const leads = (await f.db.query("SELECT * FROM leads")).rows;
    assert.equal(leads.length, 1);
    assert.equal(leads[0].name, "Maria da Silva");
    assert.equal(leads[0].source, "facebook");
    assert.equal(leads[0].external_lead_id, "lead-123");
    assert.equal(Number(leads[0].budget), 100000);
    assert.equal(graphCalls, 1);
    assert.equal(geminiCalls, 1);
    assert.equal(
      (await f.db.query("SELECT COUNT(*) FROM meta_webhook_events")).rows[0]
        .count,
      1,
    );
    const analysis = (await f.db.query("SELECT * FROM lead_ai_analyses"))
      .rows[0];
    assert.equal(analysis.score, 82);
    assert.equal(analysis.model, "gemini-test-model");
  });
  await t.test("análise manual é administrativa e não muda etapa", async () => {
    const lead = (await f.db.query("SELECT * FROM leads")).rows[0];
    assert.equal(
      (
        await f.request(`/api/leads/${lead.id}/analyze`, {
          role: null,
          method: "POST",
        })
      ).status,
      401,
    );
    const r = await f.request(`/api/leads/${lead.id}/analyze`, {
      method: "POST",
    });
    assert.equal(r.status, 201);
    assert.equal(geminiCalls, 2);
    assert.equal(
      (await f.db.query("SELECT status FROM leads WHERE id=$1", [lead.id]))
        .rows[0].status,
      "new",
    );
    const details = (await f.request(`/api/leads/${lead.id}`)).data.lead;
    assert.equal(details.ai_score, 82);
    assert.match(details.ai_response_draft, /Olá, Maria/);
  });
});
