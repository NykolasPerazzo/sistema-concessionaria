const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/sales-fixture");

test("perfil inteligente do lead: campos declarados, pontuação, tarefas e interações", async (t) => {
  const f = await fixture();
  t.after(() => f.close());

  await f.db.exec(
    `INSERT INTO vehicles(brand,model,year,price,purchase_price,entry_date,status) VALUES('Chevrolet','Tracker',2026,120000,100000,CURRENT_DATE-10,'available');`,
  );

  const base = {
    name: "Carlos Teste",
    phone: "(53) 98888-0000",
    source: "instagram",
  };

  const create = async (patch, role) =>
    f.request("/api/leads", {
      method: "POST",
      role,
      body: { ...base, ...patch },
    });

  const detail = async (id, role) =>
    (await f.request(`/api/leads/${id}`, { role })).data;

  let l;

  await t.test("lead sem dados completos não quebra", async () => {
    const r = await create();
    assert.equal(r.status, 201);
    l = r.data.lead;
    // Mesmo sem nenhum critério atendido, a pontuação é calculada (0 = Frio),
    // não fica em um estado "nulo" — é o comportamento transparente esperado.
    assert.equal(r.data.score.score, 0);
    assert.deepEqual(r.data.score.reasons, []);
    const data = await detail(l.id);
    assert.equal(data.score.score, 0);
    assert.deepEqual(data.tasks, []);
    assert.match(data.lead.basic_summary, /Frio/);
  });

  await t.test("usuário sem permissão não acessa nada", async () => {
    for (const route of [
      `/api/leads/${l.id}/tasks`,
      `/api/leads/${l.id}/interactions`,
      `/api/leads/${l.id}/score/recalculate`,
    ]) {
      assert.equal(
        (await f.request(route, { role: "guest", method: "POST", body: {} }))
          .status,
        403,
      );
    }
  });

  await t.test(
    "vendedor consegue acessar leads, criar tarefa e registrar interação",
    async () => {
      assert.equal(
        (await f.request("/api/leads", { role: "vendedor" })).status,
        200,
      );

      const task = await f.request(`/api/leads/${l.id}/tasks`, {
        role: "vendedor",
        method: "POST",
        body: { title: "Ligar amanhã", due_date: "2030-01-01" },
      });
      assert.equal(task.status, 201);
      assert.equal(task.data.task.status, "open");

      const interaction = await f.request(`/api/leads/${l.id}/interactions`, {
        role: "vendedor",
        method: "POST",
        body: { version: l.version, type: "asked_simulation" },
      });
      assert.equal(interaction.status, 201);
      assert.ok(interaction.data.score.score > 0);
    },
  );

  await t.test("interação com tipo inválido é recusada", async () => {
    l = (await detail(l.id)).lead;
    assert.equal(
      (
        await f.request(`/api/leads/${l.id}/interactions`, {
          method: "POST",
          body: { version: l.version, type: "invented" },
        })
      ).status,
      400,
    );
  });

  await t.test(
    "lead manual completo: pontuação bate com as regras declaradas",
    async () => {
      const r = await create({
        name: "Beatriz Completa",
        vehicle_id: 1,
        budget: 120000,
        payment_method: "financing",
        down_payment: 20000,
        desired_installment: 2000,
        has_trade_in: "yes",
        trade_in_estimated_value: 30000,
        purchase_timeframe: "30_days",
      });
      assert.equal(r.status, 201);
      const lead = r.data.lead;
      assert.equal(lead.payment_method, "financing");
      assert.equal(lead.has_trade_in, true);

      const score = r.data.score;
      // +20 prazo, +15 veículo específico, +15 entrada, +10 parcela, +10 orçamento = 70
      assert.equal(score.score, 70);
      const labels = score.reasons.map((x) => x.label);
      assert.ok(labels.includes("Informou prazo de compra"));
      assert.ok(labels.includes("Escolheu um veículo específico"));
      assert.ok(labels.includes("Informou valor de entrada"));
      assert.ok(labels.includes("Informou parcela desejada"));
      assert.ok(labels.includes("Informou orçamento"));

      const data = await detail(lead.id);
      assert.match(data.lead.basic_summary, /Quente/);
    },
  );

  await t.test(
    "campos inválidos do perfil declarado são recusados",
    async () => {
      for (const patch of [
        { payment_method: "boleto" },
        { down_payment: -5 },
        { purchase_timeframe: "algum dia" },
        { has_trade_in: "talvez" },
        { declared_preferences: { unknown_field: "x" } },
      ])
        assert.equal((await create(patch)).status, 400);
    },
  );

  await t.test("tarefas: concluir, cancelar e transição inválida", async () => {
    const created = (
      await f.request(`/api/leads/${l.id}/tasks`, {
        method: "POST",
        body: { title: "Enviar fotos" },
      })
    ).data.task;

    const done = await f.request(
      `/api/leads/${l.id}/tasks/${created.id}`,
      { method: "PATCH", body: { status: "done" } },
    );
    assert.equal(done.status, 200);
    assert.equal(done.data.task.status, "done");

    assert.equal(
      (
        await f.request(`/api/leads/${l.id}/tasks/${created.id}`, {
          method: "PATCH",
          body: { status: "cancelled" },
        })
      ).status,
      409,
    );

    assert.equal(
      (
        await f.request(`/api/leads/${l.id}/tasks/${created.id}`, {
          method: "PATCH",
          body: { status: "invalid" },
        })
      ).status,
      400,
    );
  });

  await t.test("recalcular pontuação sob demanda", async () => {
    const r = await f.request(`/api/leads/${l.id}/score/recalculate`, {
      method: "POST",
    });
    assert.equal(r.status, 200);
    assert.equal(typeof r.data.score.score, "number");
  });

  await t.test("falha da IA é tratada sem quebrar o processo", async () => {
    l = (await detail(l.id)).lead;
    const r = await f.request(`/api/leads/${l.id}/analyze`, {
      method: "POST",
    });
    // Sem GEMINI_API_KEY configurada no ambiente de teste isolado.
    assert.equal(r.status, 500);
    assert.ok(r.data.error);
    assert.equal(
      Number(
        (await f.db.query("SELECT COUNT(*) FROM lead_ai_analyses")).rows[0]
          .count,
      ),
      0,
    );
  });
});
