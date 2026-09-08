const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/sales-fixture");
test("leads: atendimento, perdas, retornos e conversão", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  await f.db.exec(
    `INSERT INTO vehicles(brand,model,year,price,purchase_price,entry_date,status) VALUES('Chevrolet','Onix',2026,95000,80000,CURRENT_DATE-10,'available');`,
  );
  const base = {
    name: "Ana Teste",
    phone: "(53) 99999-0000",
    email: "ana@example.com",
    source: "whatsapp",
    city: "Rio Grande",
    vehicle_id: 1,
    budget: 95000,
    next_contact_date: "2020-01-01",
    notes: "Procura automático.",
  };
  const create = async (patch) =>
    f.request("/api/leads", { method: "POST", body: { ...base, ...patch } });
  const detail = async (id) => (await f.request(`/api/leads/${id}`)).data;
  const stage = async (l, status, extra = {}) =>
    f.request(`/api/leads/${l.id}/status`, {
      method: "PATCH",
      body: { version: l.version, status, ...extra },
    });
  let l;
  await t.test("autorização e validação", async () => {
    for (const role of [null, "guest"])
      for (const route of ["/api/leads", "/api/leads/1"])
        assert.equal(
          (await f.request(route, { role })).status,
          role ? 403 : 401,
        );
    assert.equal(
      (await f.request("/api/leads", { role: "vendedor" })).status,
      200,
    );
    assert.equal(
      (
        await f.request("/api/leads", {
          role: null,
          method: "POST",
          body: base,
        })
      ).status,
      401,
    );
    for (const patch of [
      { name: " " },
      { phone: "", email: "" },
      { phone: "abc" },
      { email: "invalid" },
      { source: "unknown" },
      { budget: "1.001" },
      { budget: 0 },
      { vehicle_id: [1] },
      { next_contact_date: "2026-02-31" },
    ])
      assert.equal((await create(patch)).status, 400);
    assert.equal((await create({ vehicle_id: 999 })).status, 404);
    const r = await create();
    assert.equal(r.status, 201);
    l = r.data.lead;
    const data = await detail(l.id);
    assert.equal(data.lead.overdue, true);
    assert.equal(data.events.length, 1);
  });
  await t.test("controle de versão e histórico de atendimento", async () => {
    const r = await f.request(`/api/leads/${l.id}`, {
      method: "PUT",
      body: { ...base, version: l.version, name: "Ana Atualizada" },
    });
    assert.equal(r.status, 200);
    assert.equal(
      (
        await f.request(`/api/leads/${l.id}`, {
          method: "PUT",
          body: { ...base, version: l.version },
        })
      ).status,
      409,
    );
    l = r.data.lead;
    assert.equal(
      (
        await f.request(`/api/leads/${l.id}/notes`, {
          method: "POST",
          body: { version: l.version, content: " " },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.request(`/api/leads/${l.id}/notes`, {
          method: "POST",
          body: {
            version: l.version,
            content: "Ligou para consultar o veículo.",
          },
        })
      ).status,
      201,
    );
    const d = await detail(l.id);
    l = d.lead;
    assert.equal(d.events.length, 3);
    assert.equal(d.events[0].content, "Ligou para consultar o veículo.");
  });
  await t.test(
    "perda exige motivo, sai dos retornos e permite reabertura",
    async () => {
      assert.equal((await stage(l, "lost")).status, 400);
      assert.equal(
        (await stage(l, "lost", { reason: "Sem interesse no momento" })).status,
        200,
      );
      l = (await detail(l.id)).lead;
      assert.equal(l.overdue, false);
      assert.equal(
        (
          await f.request(`/api/leads/${l.id}/convert`, {
            method: "POST",
            body: { version: l.version },
          })
        ).status,
        409,
      );
      assert.equal((await stage(l, "new")).status, 200);
      l = (await detail(l.id)).lead;
      assert.equal(l.loss_reason, null);
      assert.equal(l.overdue, true);
    },
  );
  await t.test(
    "conversão cria um único cliente e preserva vínculo de origem",
    async () => {
      assert.equal((await stage(l, "contacting")).status, 200);
      l = (await detail(l.id)).lead;
      assert.equal((await stage(l, "qualified")).status, 200);
      l = (await detail(l.id)).lead;
      const r = await f.request(`/api/leads/${l.id}/convert`, {
        method: "POST",
        body: { version: l.version },
      });
      assert.equal(r.status, 201);
      assert.equal(
        (
          await f.request(`/api/leads/${l.id}/convert`, {
            method: "POST",
            body: { version: l.version },
          })
        ).status,
        409,
      );
      l = (await detail(l.id)).lead;
      assert.equal(
        (
          await f.request(`/api/leads/${l.id}/convert`, {
            method: "POST",
            body: { version: l.version },
          })
        ).status,
        409,
      );
      const hist = (
        await f.request(`/api/customers/${r.data.customer_id}/history`)
      ).data;
      assert.equal(hist.customer.name, "Ana Atualizada");
      assert.equal(hist.leads[0].id, l.id);
      assert.equal(l.overdue, false);
      assert.equal(
        (await f.db.query("SELECT COUNT(*) FROM customers")).rows[0].count,
        1,
      );
    },
  );
  await t.test(
    "cliente existente é selecionado explicitamente e não é sobrescrito",
    async () => {
      let other = (await create({ name: "Segundo contato" })).data.lead;
      await stage(other, "qualified");
      other = (await detail(other.id)).lead;
      const r = await f.request(`/api/leads/${other.id}/convert`, {
        method: "POST",
        body: { version: other.version, customer_id: l.customer_id },
      });
      assert.equal(r.status, 201);
      assert.equal(
        (await f.db.query("SELECT COUNT(*) FROM customers")).rows[0].count,
        1,
      );
      assert.equal(
        (
          await f.db.query("SELECT name FROM customers WHERE id=$1", [
            l.customer_id,
          ])
        ).rows[0].name,
        "Ana Atualizada",
      );
    },
  );
  await t.test(
    "falha na conversão reverte cliente, etapa e evento",
    async () => {
      let fresh = (await create({ name: "Teste rollback" })).data.lead;
      await stage(fresh, "qualified");
      fresh = (await detail(fresh.id)).lead;
      await f.db.exec(
        `CREATE FUNCTION fail_lead_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='converted' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_lead BEFORE INSERT ON lead_events FOR EACH ROW EXECUTE FUNCTION fail_lead_test();`,
      );
      assert.equal(
        (
          await f.request(`/api/leads/${fresh.id}/convert`, {
            method: "POST",
            body: { version: fresh.version },
          })
        ).status,
        500,
      );
      assert.equal(
        (await f.db.query("SELECT COUNT(*) FROM customers")).rows[0].count,
        1,
      );
      assert.equal((await detail(fresh.id)).lead.status, "qualified");
    },
  );
});
