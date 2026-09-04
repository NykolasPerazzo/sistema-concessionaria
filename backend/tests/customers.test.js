const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/sales-fixture");
test("clientes: cadastro, vínculos, histórico, snapshots e arquivamento", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  await f.db.exec(
    `INSERT INTO vehicles(brand,model,year,price,purchase_price,entry_date,status) VALUES('Chevrolet','Onix',2026,95000,80000,CURRENT_DATE-10,'available'),('Ford','Ka',2020,45000,40000,CURRENT_DATE-10,'available');`,
  );
  const today = (await f.db.query("SELECT CURRENT_DATE::text AS today")).rows[0]
    .today;
  const person = {
    name: "Mariana Costa",
    phone: "(53) 99999-0000",
    email: "mariana@example.com",
    city: "Rio Grande",
    notes: "Prefere automáticos.",
  };
  let c, p, sale;
  const create = (b) =>
    f.request("/api/customers", { method: "POST", body: b });
  const getCustomer = async () =>
    (await f.request(`/api/customers/${c.id}/history`)).data;
  const proposalBody = {
    vehicle_id: 1,
    buyer_name: "Valor ignorado",
    buyer_phone: "12345678",
    proposed_price: 90000,
    payment_method: "pix",
    valid_until: today,
  };
  await t.test(
    "permissões, campos inválidos e cadastro sem dados opcionais",
    async () => {
      for (const role of [null, "vendedor"]) {
        assert.equal(
          (await f.request("/api/customers", { role })).status,
          role ? 403 : 401,
        );
        assert.equal(
          (await f.request("/api/customers/1/history", { role })).status,
          role ? 403 : 401,
        );
        assert.equal(
          (
            await f.request("/api/customers", {
              role,
              method: "POST",
              body: person,
            })
          ).status,
          role ? 403 : 401,
        );
      }
      for (const patch of [
        { name: " " },
        { email: "abc" },
        { phone: "aaa12345678" },
        { phone: "123" },
        { name: ["Ana"] },
      ])
        assert.equal((await create({ ...person, ...patch })).status, 400);
      assert.equal((await create({ name: "Somente nome" })).status, 201);
      const result = await create(person);
      assert.equal(result.status, 201);
      c = result.data.customer;
    },
  );
  await t.test(
    "vínculo de proposta usa cadastro e preserva snapshots ao editar cliente",
    async () => {
      const r = await f.request("/api/proposals", {
        method: "POST",
        body: { ...proposalBody, customer_id: c.id },
      });
      assert.equal(r.status, 201);
      p = r.data.proposal;
      assert.equal(p.buyer_name, person.name);
      assert.equal(p.buyer_phone, person.phone);
      assert.equal(p.customer_id, c.id);
      const edit = await f.request(`/api/customers/${c.id}`, {
        method: "PUT",
        body: { ...person, name: "Mariana Souza", version: c.version },
      });
      assert.equal(edit.status, 200);
      assert.equal(
        (
          await f.request(`/api/customers/${c.id}`, {
            method: "PUT",
            body: { ...person, version: c.version },
          })
        ).status,
        409,
      );
      c = edit.data.customer;
      const history = await getCustomer();
      assert.equal(history.customer.name, "Mariana Souza");
      assert.equal(history.proposals[0].buyer_name, "Mariana Costa");
      assert.equal(history.proposals.length, 1);
    },
  );
  await t.test(
    "conversão mantém cliente e os dados históricos da proposta",
    async () => {
      await f.request(`/api/proposals/${p.id}/status`, {
        method: "PATCH",
        body: { status: "sent", version: p.version },
      });
      await f.request(`/api/proposals/${p.id}/status`, {
        method: "PATCH",
        body: { status: "accepted", version: p.version + 1 },
      });
      const r = await f.request(`/api/proposals/${p.id}/convert`, {
        method: "POST",
        body: { sale_date: today },
      });
      assert.equal(r.status, 201);
      sale = r.data.sale;
      assert.equal(sale.customer_id, c.id);
      assert.equal(sale.buyer_name, "Mariana Costa");
      assert.equal((await getCustomer()).sales.length, 1);
      const list = (await f.request("/api/customers")).data.customers.find(
        (x) => x.id === c.id,
      );
      assert.equal(Number(list.sales_count), 1);
      assert.equal(Number(list.total_purchased), 90000);
    },
  );
  await t.test(
    "arquivamento preserva histórico e bloqueia novos vínculos",
    async () => {
      const r = await f.request(`/api/customers/${c.id}/status`, {
        method: "PATCH",
        body: { is_active: false, version: c.version },
      });
      assert.equal(r.status, 200);
      c = r.data.customer;
      assert.equal((await getCustomer()).sales.length, 1);
      assert.equal(
        (await f.request("/api/customers?active=true")).data.customers.some(
          (x) => x.id === c.id,
        ),
        false,
      );
      assert.equal(
        (
          await f.request("/api/proposals", {
            method: "POST",
            body: { ...proposalBody, vehicle_id: 2, customer_id: c.id },
          })
        ).status,
        409,
      );
      const saleBody = {
        vehicle_id: 2,
        buyer_name: "Mariana",
        sale_price: 45000,
        payment_method: "pix",
        sale_date: today,
        customer_id: c.id,
      };
      assert.equal(
        (await f.request("/api/sales", { method: "POST", body: saleBody }))
          .status,
        409,
      );
      const re = await f.request(`/api/customers/${c.id}/status`, {
        method: "PATCH",
        body: { is_active: true, version: c.version },
      });
      assert.equal(re.status, 200);
      c = re.data.customer;
      const direct = await f.request("/api/sales", {
        method: "POST",
        body: saleBody,
      });
      assert.equal(direct.status, 201);
      assert.equal(direct.data.sale.buyer_name, "Mariana Souza");
    },
  );
  await t.test(
    "cancelamento não apaga histórico e vínculos inválidos são recusados",
    async () => {
      await f.request(`/api/sales/${sale.id}/cancel`, {
        method: "POST",
        body: { reason: "Teste de cancelamento" },
      });
      const history = await getCustomer();
      assert.equal(history.sales.length, 2);
      assert.ok(history.sales.some((x) => x.cancelled_at));
      const summary = (await f.request("/api/customers")).data.customers.find(
        (x) => x.id === c.id,
      );
      assert.equal(Number(summary.sales_count), 1);
      assert.equal(Number(summary.total_purchased), 45000);
      for (const id of [0, [1]])
        assert.equal(
          (
            await f.request("/api/proposals", {
              method: "POST",
              body: { ...proposalBody, customer_id: id },
            })
          ).status,
          400,
        );
      assert.equal(
        (
          await f.request("/api/proposals", {
            method: "POST",
            body: { ...proposalBody, customer_id: 999 },
          })
        ).status,
        409,
      );
      assert.equal((await f.request("/api/customers/999/history")).status, 404);
    },
  );
});
