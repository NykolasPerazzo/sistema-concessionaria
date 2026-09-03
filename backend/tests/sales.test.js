const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/sales-fixture");
test("vendas: autenticação, validação, valores, estoque, histórico e cancelamento", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  await f.db
    .exec(`INSERT INTO vehicles(brand,model,year,price,purchase_price,entry_date,status) VALUES
    ('Chevrolet','Onix',2025,85000,70000,CURRENT_DATE-10,'available'),
    ('Chevrolet','Tracker',2025,130000,NULL,CURRENT_DATE-10,'available'),
    ('BMW','320i',2025,250000,230000,CURRENT_DATE-10,'reserved'),
    ('Ford','Ka',2020,45000,40000,CURRENT_DATE-10,'available');
    INSERT INTO vehicle_expenses(vehicle_id,amount) VALUES (1,1500.25),(1,499.75);`);
  const today = (await f.db.query("SELECT CURRENT_DATE::text AS today")).rows[0]
    .today;
  const body = {
    vehicle_id: 1,
    buyer_name: "Maria Silva",
    sale_price: "82000.50",
    sale_date: today,
    payment_method: "pix",
  };
  await t.test(
    "rotas administrativas recusam visitantes e vendedores",
    async () => {
      for (const role of [null, "vendedor"])
        for (const route of ["/api/sales", "/api/sales/vehicles"])
          assert.equal(
            (await f.request(route, { role })).status,
            role ? 403 : 401,
          );
      assert.equal(
        (await f.request("/api/sales", { role: null, method: "POST", body }))
          .status,
        401,
      );
    },
  );
  await t.test("entrada inválida não altera estoque", async () => {
    for (const patch of [
      { sale_price: true },
      { sale_price: "1.001" },
      { sale_price: 0 },
      { sale_date: "2026-02-31" },
      { sale_date: "2099-01-01" },
      { sale_date: "1900-01-01" },
      { buyer_name: " " },
      { payment_method: "unknown" },
      { vehicle_id: "1 OR 1=1" },
    ]) {
      assert.equal(
        (
          await f.request("/api/sales", {
            method: "POST",
            body: { ...body, ...patch },
          })
        ).status,
        400,
      );
    }
    assert.equal(
      (
        await f.request("/api/sales", {
          method: "POST",
          body: { ...body, vehicle_id: 999 },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await f.request("/api/sales", {
          method: "POST",
          body: { ...body, vehicle_id: 2 },
        })
      ).status,
      409,
    );
    assert.equal(
      (await f.db.query("SELECT count(*) FROM sales")).rows[0].count,
      0,
    );
  });
  let saleId;
  await t.test(
    "confirma venda, calcula resultado e bloqueia duplicação",
    async () => {
      const sale = await f.request("/api/sales", { method: "POST", body });
      assert.equal(sale.status, 201);
      saleId = sale.data.sale.id;
      const history = await f.request("/api/sales");
      assert.equal(history.data.sales[0].profit, "10000.50");
      const vehicle = (
        await f.db.query("SELECT status,sale_price FROM vehicles WHERE id=1")
      ).rows[0];
      assert.equal(vehicle.status, "sold");
      assert.equal(vehicle.sale_price, "82000.50");
      assert.equal(
        (await f.request("/api/sales", { method: "POST", body })).status,
        409,
      );
      const available = await f.request("/api/sales/vehicles");
      assert.ok(!available.data.vehicles.some((v) => v.id === 1));
      assert.equal(
        (await f.request("/api/sales?start=2099-01-01")).data.sales.length,
        0,
      );
      assert.equal(
        (await f.request("/api/sales?start=2026-03-10&end=2026-03-01")).status,
        400,
      );
    },
  );
  await t.test(
    "histórico mantém custos e impede edição financeira/exclusão do veículo",
    async () => {
      await f.db.query(
        "INSERT INTO vehicle_expenses(vehicle_id,amount) VALUES (1,100)",
      );
      assert.equal(
        (await f.request("/api/sales")).data.sales[0].profit,
        "10000.50",
      );
      const payload = {
        brand: "Chevrolet",
        model: "Onix",
        year: 2025,
        price: 85000,
        purchase_price: 70000,
        sale_price: 82000.5,
        status: "available",
      };
      assert.equal(
        (await f.request("/api/vehicles/1", { method: "PUT", body: payload }))
          .status,
        409,
      );
      assert.equal(
        (
          await f.request("/api/vehicles/1", {
            method: "PUT",
            body: { ...payload, status: "sold" },
          })
        ).status,
        200,
      );
      assert.equal(
        (await f.request("/api/vehicles/1", { method: "DELETE" })).status,
        409,
      );
    },
  );
  await t.test(
    "falha entre INSERT e UPDATE faz rollback da venda",
    async () => {
      await f.db
        .exec(`CREATE FUNCTION fail_sale_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=4 AND NEW.status='sold' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_sale BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION fail_sale_test();`);
      assert.equal(
        (
          await f.request("/api/sales", {
            method: "POST",
            body: { ...body, vehicle_id: 4 },
          })
        ).status,
        500,
      );
      assert.equal(
        (await f.db.query("SELECT count(*) FROM sales WHERE vehicle_id=4"))
          .rows[0].count,
        0,
      );
      assert.equal(
        (await f.db.query("SELECT status FROM vehicles WHERE id=4")).rows[0]
          .status,
        "available",
      );
    },
  );
  await t.test(
    "cancelamento preserva histórico e permite nova venda",
    async () => {
      assert.equal(
        (
          await f.request(`/api/sales/${saleId}/cancel`, {
            method: "POST",
            body: { reason: " " },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await f.request(`/api/sales/${saleId}/cancel`, {
            method: "POST",
            body: { reason: "Cliente desistiu" },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await f.request(`/api/sales/${saleId}/cancel`, {
            method: "POST",
            body: { reason: "Repetição" },
          })
        ).status,
        409,
      );
      assert.equal((await f.request("/api/sales")).data.sales.length, 0);
      assert.equal(
        (await f.request("/api/sales?status=cancelled")).data.sales.length,
        1,
      );
      const vehicle = (
        await f.db.query("SELECT status,sale_price FROM vehicles WHERE id=1")
      ).rows[0];
      assert.equal(vehicle.status, "available");
      assert.equal(vehicle.sale_price, null);
      assert.equal(
        (await f.request("/api/sales", { method: "POST", body })).status,
        201,
      );
      assert.equal(
        (await f.request("/api/sales?status=all")).data.sales.length,
        2,
      );
    },
  );
  await t.test(
    "venda abaixo do custo e retorno ao status reservado",
    async () => {
      const result = await f.request("/api/sales", {
        method: "POST",
        body: { ...body, vehicle_id: 3, sale_price: 200000 },
      });
      assert.equal(result.status, 201);
      const sale = (await f.request("/api/sales")).data.sales.find(
        (s) => s.vehicle_id === 3,
      );
      assert.equal(sale.profit, "-30000.00");
      await f.request(`/api/sales/${sale.id}/cancel`, {
        method: "POST",
        body: { reason: "Correção" },
      });
      assert.equal(
        (await f.db.query("SELECT status FROM vehicles WHERE id=3")).rows[0]
          .status,
        "reserved",
      );
    },
  );
});
