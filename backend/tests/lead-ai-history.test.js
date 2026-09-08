const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/sales-fixture");

test("histórico de análises de IA: sucesso, falha e não regressão da última boa", async (t) => {
  const f = await fixture();
  t.after(() => f.close());

  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  process.env.GEMINI_API_KEY = "gemini-test";
  process.env.GEMINI_MODEL = "gemini-test-model";

  await f.db.exec(
    `INSERT INTO vehicles(brand,model,year,price,purchase_price,entry_date,status) VALUES('Chevrolet','Tracker',2026,120000,100000,CURRENT_DATE-10,'available');`,
  );

  const lead = (
    await f.request("/api/leads", {
      method: "POST",
      body: {
        name: "Joana Histórico",
        phone: "(53) 99000-1111",
        source: "website",
        vehicle_id: 1,
        budget: 120000,
      },
    })
  ).data.lead;

  let mode = "ok";

  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.startsWith(f.url)) return originalFetch(url, options);
    if (target.includes("generativelanguage.googleapis.com")) {
      if (mode === "http-error") {
        return new Response(JSON.stringify({ error: "unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      if (mode === "incomplete") {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        score: 50,
                        intent: "medium",
                        urgency: "medium",
                        summary: "",
                        next_action: "",
                        response_draft: "",
                        probable_objection: "",
                        advance_probability: "medium",
                        score_justification: "",
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
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      score: 78,
                      intent: "high",
                      urgency: "medium",
                      summary: "Quer uma Tracker e já informou orçamento.",
                      next_action: "Enviar simulação de financiamento.",
                      response_draft: "Olá, Joana! Vamos falar sobre a Tracker.",
                      probable_objection: "Valor da parcela.",
                      advance_probability: "medium",
                      score_justification:
                        "Orçamento e veículo definidos, sem sinal de urgência declarada.",
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

  await t.test("análise bem-sucedida grava histórico completo", async () => {
    const r = await f.request(`/api/leads/${lead.id}/analyze`, {
      method: "POST",
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.analysis.status, "ok");
    assert.equal(r.data.analysis.prompt_version, "lead-analysis-v2");
    assert.ok(r.data.analysis.input_snapshot);
    assert.equal(r.data.analysis.probable_objection, "Valor da parcela.");
    assert.equal(r.data.analysis.advance_probability, "medium");
    assert.ok(r.data.analysis.score_justification);

    const detail = (await f.request(`/api/leads/${lead.id}`)).data;
    assert.equal(detail.lead.ai_score, 78);
    assert.equal(detail.lead.ai_probable_objection, "Valor da parcela.");
    assert.equal(detail.analyses.length, 1);
    assert.equal(detail.analyses[0].status, "ok");
  });

  await t.test(
    "falha HTTP do Gemini não substitui a última análise boa",
    async () => {
      mode = "http-error";
      const failing = await f.request(`/api/leads/${lead.id}/analyze`, {
        method: "POST",
      });
      assert.equal(failing.status, 500);

      const detail = (await f.request(`/api/leads/${lead.id}`)).data;
      // A análise anterior (boa) continua sendo a exibida.
      assert.equal(detail.lead.ai_score, 78);
      assert.ok(detail.lead.ai_last_error);
      assert.match(detail.lead.ai_last_error.message, /Gemini recusou/);
      // Histórico mostra as duas tentativas, mais recente primeiro.
      assert.equal(detail.analyses.length, 2);
      assert.equal(detail.analyses[0].status, "error");
      assert.equal(detail.analyses[1].status, "ok");
    },
  );

  await t.test("análise incompleta também é registrada como erro", async () => {
    mode = "incomplete";
    const r = await f.request(`/api/leads/${lead.id}/analyze`, {
      method: "POST",
    });
    assert.equal(r.status, 500);
    const detail = (await f.request(`/api/leads/${lead.id}`)).data;
    assert.equal(detail.analyses.length, 3);
    assert.match(detail.analyses[0].error_message, /incompleta/);
  });

  await t.test(
    "criar tarefa a partir da sugestão da IA usa o endpoint já existente",
    async () => {
      const detail = (await f.request(`/api/leads/${lead.id}`)).data;
      const task = await f.request(`/api/leads/${lead.id}/tasks`, {
        method: "POST",
        body: { title: detail.lead.ai_next_action.slice(0, 255) },
      });
      assert.equal(task.status, 201);
      assert.equal(task.data.task.title, "Enviar simulação de financiamento.");
    },
  );
});
