const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/sales-fixture");

test("atribuição de lead a um vendedor", async (t) => {
  const f = await fixture();
  t.after(() => f.close());

  const create = async (patch, role) =>
    f.request("/api/leads", {
      method: "POST",
      role,
      body: {
        name: "Rafael Teste",
        phone: "(53) 99777-0000",
        source: "website",
        ...patch,
      },
    });

  const detail = async (id) => (await f.request(`/api/leads/${id}`)).data;

  await t.test(
    "GET /api/users retorna os usuários semeados e bloqueia papel não autorizado",
    async () => {
      const r = await f.request("/api/users");
      assert.equal(r.status, 200);
      assert.equal(r.data.users.length, 2);
      const roles = r.data.users.map((u) => u.role).sort();
      assert.deepEqual(roles, ["admin", "vendedor"]);

      assert.equal((await f.request("/api/users", { role: "guest" })).status, 403);
      assert.equal((await f.request("/api/users", { role: null })).status, 401);
      assert.equal(
        (await f.request("/api/users", { role: "vendedor" })).status,
        200,
      );
    },
  );

  let l;

  await t.test("criar lead com assigned_to válido persiste", async () => {
    const r = await create({ assigned_to: 2 });
    assert.equal(r.status, 201);
    l = r.data.lead;
    assert.equal(l.assigned_to, 2);
  });

  await t.test("assigned_to inexistente é recusado", async () => {
    const r = await create({ assigned_to: 999 });
    assert.equal(r.status, 404);
  });

  await t.test(
    "PATCH /:id/assign atribui, reatribui, desatribui e respeita versão",
    async () => {
      l = (await detail(l.id)).lead;

      const reassign = await f.request(`/api/leads/${l.id}/assign`, {
        method: "PATCH",
        body: { version: l.version, assigned_to: 1 },
      });
      assert.equal(reassign.status, 200);
      l = (await detail(l.id)).lead;
      assert.equal(l.assigned_to, 1);

      const conflict = await f.request(`/api/leads/${l.id}/assign`, {
        method: "PATCH",
        body: { version: l.version - 1, assigned_to: 2 },
      });
      assert.equal(conflict.status, 409);

      const invalid = await f.request(`/api/leads/${l.id}/assign`, {
        method: "PATCH",
        body: { version: l.version, assigned_to: 999 },
      });
      assert.equal(invalid.status, 404);
      l = (await detail(l.id)).lead;
      assert.equal(l.assigned_to, 1, "não deve mudar após tentativa inválida");

      const unassign = await f.request(`/api/leads/${l.id}/assign`, {
        method: "PATCH",
        body: { version: l.version, assigned_to: null },
      });
      assert.equal(unassign.status, 200);
      const data = await detail(l.id);
      assert.equal(data.lead.assigned_to, null);
      assert.match(data.events[0].content, /desatribuído/i);
    },
  );

  await t.test("vendedor consegue atribuir/reatribuir", async () => {
    l = (await detail(l.id)).lead;
    const r = await f.request(`/api/leads/${l.id}/assign`, {
      role: "vendedor",
      method: "PATCH",
      body: { version: l.version, assigned_to: 2 },
    });
    assert.equal(r.status, 200);
  });

  await t.test("papel não autorizado continua bloqueado", async () => {
    l = (await detail(l.id)).lead;
    const r = await f.request(`/api/leads/${l.id}/assign`, {
      role: "guest",
      method: "PATCH",
      body: { version: l.version, assigned_to: 1 },
    });
    assert.equal(r.status, 403);
  });
});
