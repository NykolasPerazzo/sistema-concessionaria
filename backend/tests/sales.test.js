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
    seller_id: 1,
  };
  await t.test(
    "rotas de vendas exigem autenticação e papel autorizado (admin ou vendedor)",
    async () => {
      for (const route of [
        "/api/sales",
        "/api/sales/vehicles",
        "/api/sales/sellers",
      ]) {
        assert.equal((await f.request(route, { role: null })).status, 401);
        assert.equal(
          (await f.request(route, { role: "despachante" })).status,
          403,
        );
        assert.equal(
          (await f.request(route, { role: "vendedor" })).status,
          200,
        );
      }
      assert.equal(
        (await f.request("/api/sales", { role: null, method: "POST", body }))
          .status,
        401,
      );
      assert.equal(
        (
          await f.request("/api/sales", {
            role: "despachante",
            method: "POST",
            body,
          })
        ).status,
        403,
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
      (
        await f.request("/api/sales", {
          method: "POST",
          body: { ...body, seller_id: undefined },
        })
      ).status,
      400,
      "vendedor é obrigatório para o administrador",
    );
    assert.equal(
      (
        await f.request("/api/sales", {
          method: "POST",
          body: { ...body, seller_id: 999 },
        })
      ).status,
      400,
      "vendedor inexistente deve ser recusado",
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
      assert.equal(history.data.sales[0].seller_id, 1);
      assert.equal(history.data.sales[0].seller_name, "Admin Teste");
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
  await t.test(
    "GET /api/sales/sellers retorna só quem pode vender, sem dados sensíveis",
    async () => {
      const result = await f.request("/api/sales/sellers");
      assert.equal(result.status, 200);
      const roles = result.data.sellers.map((s) => s.role).sort();
      assert.deepEqual(roles, ["admin", "vendedor"]);
      result.data.sellers.forEach((seller) => {
        assert.ok(!("password_hash" in seller));
        assert.ok(!("password" in seller));
      });
    },
  );
  await t.test(
    "venda antiga sem vendedor continua aparecendo com seller_id/seller_name nulos",
    async () => {
      await f.db.exec(`
        INSERT INTO vehicles(brand,model,year,price,purchase_price,entry_date,status)
        VALUES ('Renault','Kwid',2019,45000,38000,CURRENT_DATE-30,'sold');
        INSERT INTO sales(vehicle_id,vehicle_label,buyer_name,sale_date,sale_price,purchase_price,expenses_total,payment_method,previous_status,created_by)
        VALUES ((SELECT max(id) FROM vehicles),'Renault Kwid • 2019','Comprador Antigo',CURRENT_DATE-20,44000,38000,0,'cash','available',1);
      `);
      const legacy = (
        await f.request("/api/sales?status=all")
      ).data.sales.find((sale) => sale.buyer_name === "Comprador Antigo");
      assert.ok(legacy, "venda antiga deve continuar aparecendo no histórico");
      assert.equal(legacy.seller_id, null);
      assert.equal(legacy.seller_name, null);
    },
  );
  await t.test(
    "vendedor vende em nome próprio, ignora seller_id do payload e só gerencia as próprias vendas",
    async () => {
      await f.db.exec(`
        INSERT INTO vehicles(brand,model,year,price,purchase_price,entry_date,status)
        VALUES ('Fiat','Argo',2023,75000,60000,CURRENT_DATE-5,'available');
      `);
      const vehicleId = (
        await f.db.query("SELECT max(id) AS id FROM vehicles")
      ).rows[0].id;
      const sellerAttempt = await f.request("/api/sales", {
        role: "vendedor",
        method: "POST",
        body: { ...body, vehicle_id: vehicleId, seller_id: 1 },
      });
      assert.equal(sellerAttempt.status, 201);
      assert.equal(
        sellerAttempt.data.sale.seller_id,
        2,
        "seller_id enviado no payload deve ser ignorado para o papel vendedor",
      );
      const vendorView = await f.request("/api/sales?status=all", {
        role: "vendedor",
      });
      assert.ok(
        vendorView.data.sales.every((sale) => sale.seller_id === 2),
        "vendedor não deve enxergar vendas de outros vendedores",
      );
      assert.ok(
        vendorView.data.sales.some((sale) => sale.vehicle_id === vehicleId),
      );
      const adminView = await f.request("/api/sales?status=all");
      assert.ok(
        adminView.data.sales.some(
          (sale) => sale.vehicle_id === vehicleId && sale.seller_id === 2,
        ),
        "admin deve enxergar as vendas de todos os vendedores",
      );
      const otherSale = adminView.data.sales.find(
        (sale) => sale.seller_id === 1 && !sale.cancelled_at,
      );
      assert.ok(
        otherSale,
        "precisa existir venda ativa do admin para testar o bloqueio de cancelamento",
      );
      const blocked = await f.request(`/api/sales/${otherSale.id}/cancel`, {
        role: "vendedor",
        method: "POST",
        body: { reason: "Tentativa indevida" },
      });
      assert.equal(blocked.status, 403);
      const ownCancel = await f.request(
        `/api/sales/${sellerAttempt.data.sale.id}/cancel`,
        {
          role: "vendedor",
          method: "POST",
          body: { reason: "Desistiu" },
        },
      );
      assert.equal(ownCancel.status, 200);
    },
  );
});
