const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/sales-fixture");
test("propostas: negociação, validade e conversão atômica", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  await f.db
    .exec(`INSERT INTO vehicles(brand,model,year,price,purchase_price,entry_date,status) VALUES
 ('Chevrolet','Onix',2025,90000,70000,CURRENT_DATE-10,'available'),
 ('BMW','320i',2025,250000,NULL,CURRENT_DATE-10,'available'),
 ('Ford','Ka',2020,45000,40000,CURRENT_DATE-10,'available');
 INSERT INTO vehicle_expenses(vehicle_id,amount) VALUES(1,1000);`);
  const today = (await f.db.query("SELECT CURRENT_DATE::text AS today")).rows[0]
    .today;
  const base = {
    vehicle_id: 1,
    buyer_name: "Ana <script>alert(1)</script>",
    buyer_phone: "(53) 99999-0000",
    proposed_price: "85000.50",
    payment_method: "pix",
    valid_until: today,
    notes: "Entrada e saldo conforme combinado.",
  };
  const create = async (patch = {}) =>
    f.request("/api/proposals", {
      method: "POST",
      body: { ...base, ...patch },
    });
  const list = async () => (await f.request("/api/proposals")).data.proposals;
  const status = async (p, next) =>
    f.request(`/api/proposals/${p.id}/status`, {
      method: "PATCH",
      body: { status: next, version: p.version },
    });
  const convert = async (id) =>
    f.request(`/api/proposals/${id}/convert`, {
      method: "POST",
      body: { sale_date: today },
    });
  let first;
  await t.test("acesso e validação", async () => {
    for (const role of [null, "vendedor"])
      assert.equal(
        (await f.request("/api/proposals", { role })).status,
        role ? 403 : 401,
      );
    for (const patch of [
      { vehicle_id: 0 },
      { vehicle_id: [1] },
      { buyer_name: " " },
      { proposed_price: true },
      { proposed_price: "1.001" },
      { valid_until: "2026-02-31" },
      { valid_until: "2000-01-01" },
      { payment_method: "invalid" },
    ])
      assert.equal((await create(patch)).status, 400);
    const r = await create();
    assert.equal(r.status, 201);
    first = r.data.proposal;
    assert.equal(first.status, "draft");
    assert.equal(
      (await f.db.query("SELECT status FROM vehicles WHERE id=1")).rows[0]
        .status,
      "available",
    );
  });
  await t.test(
    "edição de rascunhos e versão contra alterações simultâneas",
    async () => {
      const edit = await f.request(`/api/proposals/${first.id}`, {
        method: "PUT",
        body: { ...base, version: first.version, notes: "Revisada" },
      });
      assert.equal(edit.status, 200);
      assert.equal(
        (
          await f.request(`/api/proposals/${first.id}`, {
            method: "PUT",
            body: { ...base, version: first.version },
          })
        ).status,
        409,
      );
      first = edit.data.proposal;
      assert.equal((await status(first, "accepted")).status, 409);
      assert.equal((await convert(first.id)).status, 409);
      assert.equal((await status(first, "sent")).status, 200);
      first = (await list()).find((p) => p.id === first.id);
      assert.equal(
        (
          await f.request(`/api/proposals/${first.id}`, {
            method: "PUT",
            body: { ...base, version: first.version },
          })
        ).status,
        409,
      );
      assert.equal((await status(first, "accepted")).status, 200);
    },
  );
  await t.test(
    "conversão copia dados, calcula resultado e vincula uma única venda",
    async () => {
      const r = await convert(first.id);
      assert.equal(r.status, 201);
      const p = (await list()).find((p) => p.id === first.id);
      assert.equal(p.status, "converted");
      assert.equal(p.sale_id, r.data.sale.id);
      assert.equal(r.data.sale.buyer_name, base.buyer_name);
      assert.equal(r.data.sale.notes, "Revisada");
      assert.equal(r.data.sale.sale_price, "85000.50");
      const sale = (await f.request("/api/sales")).data.sales[0];
      assert.equal(sale.profit, "14000.50");
      assert.equal((await convert(first.id)).status, 409);
      assert.equal((await create()).status, 409);
      assert.equal((await status(p, "cancelled")).status, 409);
      await f.request(`/api/sales/${sale.id}/cancel`, {
        method: "POST",
        body: { reason: "Desistência" },
      });
      assert.ok(
        (await list()).find((p) => p.id === first.id).sale_cancelled_at,
      );
      assert.equal((await convert(first.id)).status, 409);
    },
  );
  await t.test(
    "validade, recusa, custo ausente e veículo vendido por outra negociação",
    async () => {
      let p = (await create()).data.proposal;
      await status(p, "sent");
      p = (await list()).find((v) => v.id === p.id);
      await f.db.query(
        "UPDATE proposals SET valid_until=CURRENT_DATE-1 WHERE id=$1",
        [p.id],
      );
      assert.equal(
        (await list()).find((v) => v.id === p.id).effective_status,
        "expired",
      );
      assert.equal((await status(p, "accepted")).status, 409);
      assert.equal((await status(p, "cancelled")).status, 200);
      let q = (await create({ vehicle_id: 2 })).data.proposal;
      await status(q, "sent");
      q = (await list()).find((v) => v.id === q.id);
      await status(q, "accepted");
      assert.equal((await convert(q.id)).status, 409);
      assert.equal(
        (await list()).find((v) => v.id === q.id).status,
        "accepted",
      );
      let r = (await create()).data.proposal;
      await status(r, "sent");
      r = (await list()).find((v) => v.id === r.id);
      assert.equal((await status(r, "rejected")).status, 200);
      assert.equal((await convert(r.id)).status, 409);
      let sold = (await create()).data.proposal;
      await status(sold, "sent");
      sold = (await list()).find((v) => v.id === sold.id);
      await status(sold, "accepted");
      await f.request("/api/sales", {
        method: "POST",
        body: {
          vehicle_id: 1,
          buyer_name: "Outro comprador",
          sale_price: 90000,
          sale_date: today,
          payment_method: "pix",
        },
      });
      assert.equal((await convert(sold.id)).status, 409);
    },
  );
  await t.test(
    "falha ao vincular proposta desfaz venda e estoque",
    async () => {
      let p = (await create({ vehicle_id: 3 })).data.proposal;
      await status(p, "sent");
      p = (await list()).find((v) => v.id === p.id);
      await status(p, "accepted");
      await f.db.exec(
        `CREATE FUNCTION fail_proposal_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='converted' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_proposal BEFORE UPDATE ON proposals FOR EACH ROW EXECUTE FUNCTION fail_proposal_test();`,
      );
      assert.equal((await convert(p.id)).status, 500);
      assert.equal(
        (await f.db.query("SELECT status FROM vehicles WHERE id=3")).rows[0]
          .status,
        "available",
      );
      assert.equal(
        (await f.db.query("SELECT count(*) FROM sales WHERE vehicle_id=3"))
          .rows[0].count,
        0,
      );
      assert.equal(
        (await list()).find((v) => v.id === p.id).status,
        "accepted",
      );
    },
  );
});
