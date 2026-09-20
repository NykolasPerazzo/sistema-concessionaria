const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/sales-fixture");

test("leads: kanban (arrastar e soltar, posição e etapa)", async (t) => {
  const f = await fixture();
  t.after(() => f.close());

  const create = async (name) =>
    (
      await f.request("/api/leads", {
        method: "POST",
        body: { name, phone: "(53) 99999-0000", source: "whatsapp" },
      })
    ).data.lead;

  const move = async (lead, body, opts = {}) =>
    f.request(`/api/leads/${lead.id}/move`, {
      method: "PATCH",
      body: { version: lead.version, ...body },
      ...opts,
    });

  const byId = (list, id) => list.find((l) => l.id === id);

  let a = await create("Lead A");
  let b = await create("Lead B");
  let c = await create("Lead C");

  await t.test("posição inicial segue a ordem de criação", async () => {
    const list = (await f.request("/api/leads")).data.leads;
    assert.equal(byId(list, a.id).position, 0);
    assert.equal(byId(list, b.id).position, 1);
    assert.equal(byId(list, c.id).position, 2);
  });

  await t.test("autenticação e autorização", async () => {
    assert.equal(
      (
        await move(a, { status: "new", position: 0 }, { role: null })
      ).status,
      401,
    );
    assert.equal(
      (
        await move(a, { status: "new", position: 0 }, { role: "guest" })
      ).status,
      403,
    );
  });

  await t.test("rejeita etapa e posição inválidas", async () => {
    assert.equal((await move(a, { status: "unknown", position: 0 })).status, 400);
    assert.equal((await move(a, { status: "new", position: -1 })).status, 400);
    assert.equal(
      (await move(a, { status: "new", position: 1.5 })).status,
      400,
    );
  });

  await t.test("lead inexistente retorna 404", async () => {
    const r = await f.request("/api/leads/999999/move", {
      method: "PATCH",
      body: { version: 1, status: "new", position: 0 },
    });
    assert.equal(r.status, 404);
  });

  await t.test("conflito de versão retorna 409", async () => {
    const r = await move(a, { status: "new", position: 0, version: 999 });
    assert.equal(r.status, 409);
  });

  await t.test(
    "reordena dentro da mesma etapa e atualiza as posições dos outros cards",
    async () => {
      // A(0) B(1) C(2) -> mover A para a posição 2 (depois de B e C)
      const r = await move(a, { status: "new", position: 2 });
      assert.equal(r.status, 200);
      assert.equal(r.data.lead.status, "new");
      assert.equal(r.data.lead.position, 2);

      const list = (await f.request("/api/leads")).data.leads;
      assert.equal(byId(list, b.id).position, 0);
      assert.equal(byId(list, c.id).position, 1);
      assert.equal(byId(list, a.id).position, 2);

      a = byId(list, a.id);
      b = byId(list, b.id);
      c = byId(list, c.id);
    },
  );

  await t.test("mover para a mesma posição não altera nada (idempotente)", async () => {
    const before = (await f.request("/api/leads")).data.leads;
    const r = await move(a, { status: "new", position: 2 });
    assert.equal(r.status, 200);
    assert.equal(r.data.lead.version, a.version);
    const after = (await f.request("/api/leads")).data.leads;
    assert.deepEqual(
      before.map((l) => [l.id, l.status, l.position]),
      after.map((l) => [l.id, l.status, l.position]),
    );
  });

  await t.test("rejeita transição de etapa não permitida", async () => {
    // new -> converted não é uma transição válida (precisa qualificar antes)
    const r = await move(b, { status: "converted", position: 0 });
    assert.equal(r.status, 409);
  });

  await t.test(
    "move entre etapas, fecha o espaço na origem e abre na coluna de destino",
    async () => {
      // b está em 'new' na posição 0; move para 'contacting'
      const r = await move(b, { status: "contacting", position: 0 });
      assert.equal(r.status, 200);
      assert.equal(r.data.lead.status, "contacting");
      assert.equal(r.data.lead.position, 0);

      const list = (await f.request("/api/leads")).data.leads;
      // origem ('new') fechou o espaço: c e a reindexados a partir de 0
      assert.equal(byId(list, c.id).position, 0);
      assert.equal(byId(list, a.id).position, 1);
      assert.equal(byId(list, b.id).status, "contacting");
      assert.equal(byId(list, b.id).position, 0);

      b = byId(list, b.id);
      c = byId(list, c.id);
      a = byId(list, a.id);
    },
  );

  await t.test("exige motivo para mover para perdido", async () => {
    const r = await move(a, { status: "lost", position: 0 });
    assert.equal(r.status, 400);
  });

  await t.test("move para perdido salva o motivo", async () => {
    const r = await move(a, {
      status: "lost",
      position: 0,
      reason: "Comprou em outra loja",
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.lead.status, "lost");

    const detail = (await f.request(`/api/leads/${a.id}`)).data.lead;
    assert.equal(detail.loss_reason, "Comprou em outra loja");

    a = detail;
  });

  await t.test(
    "persistência: a ordem sobrevive a uma nova consulta (equivalente a recarregar a página)",
    async () => {
      const first = (await f.request("/api/leads")).data.leads;
      const second = (await f.request("/api/leads")).data.leads;
      assert.deepEqual(
        first.map((l) => [l.id, l.status, l.position]),
        second.map((l) => [l.id, l.status, l.position]),
      );
    },
  );

  await t.test(
    "erro dentro da transação não deixa a movimentação pela metade (rollback)",
    async () => {
      const fresh = await create("Lead Rollback");

      await f.db.exec(
        `CREATE FUNCTION fail_move_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='stage_changed' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_move BEFORE INSERT ON lead_events FOR EACH ROW EXECUTE FUNCTION fail_move_test();`,
      );

      const beforeList = (await f.request("/api/leads")).data.leads;
      const beforePositions = beforeList.map((l) => [l.id, l.status, l.position]);

      const r = await move(fresh, { status: "contacting", position: 0 });
      assert.equal(r.status, 500);

      const afterList = (await f.request("/api/leads")).data.leads;
      assert.deepEqual(
        afterList.map((l) => [l.id, l.status, l.position]),
        beforePositions,
      );

      await f.db.exec(`DROP TRIGGER fail_move ON lead_events;`);
    },
  );
});
