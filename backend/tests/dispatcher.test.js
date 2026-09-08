const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/dispatcher-fixture");

test("despachante: processos, checklist e linha do tempo", async (t) => {
  const f = await fixture();
  t.after(() => f.close());

  await f.db.exec(`
    INSERT INTO vehicles(brand,model,year,price,purchase_price,entry_date,status)
    VALUES('Chevrolet','Onix',2026,95000,80000,CURRENT_DATE-30,'sold');
    INSERT INTO customers(name,phone,created_by) VALUES('Ana Compradora','(53) 99999-0000',1);
    INSERT INTO customers(name,phone,created_by) VALUES('Bruno Comprador','(53) 98888-0000',1);
  `);
  // Venda "própria" do vendedor 2 (created_by=2), usada para testar visibilidade.
  await f.db.exec(`
    INSERT INTO sales(vehicle_id,vehicle_label,buyer_name,sale_date,sale_price,purchase_price,expenses_total,payment_method,previous_status,created_by,customer_id)
    VALUES(1,'Chevrolet Onix • 2026','Ana Compradora',CURRENT_DATE,95000,80000,0,'pix','available',2,1);
  `);

  const base = {
    service_type: "transferencia_propriedade",
    vehicle_id: 1,
    customer_id: 1,
  };
  const create = (patch, opts) =>
    f.request("/api/dispatcher/processes", {
      method: "POST",
      body: { ...base, ...patch },
      ...opts,
    });
  const detail = async (id, opts) =>
    (await f.request(`/api/dispatcher/processes/${id}`, opts)).data;

  let p;

  await t.test("autorização", async () => {
    for (const route of ["/api/dispatcher/processes", "/api/dispatcher/processes/1"]) {
      assert.equal((await f.request(route, { role: null })).status, 401);
      assert.equal((await f.request(route, { role: "guest" })).status, 403);
    }
    assert.equal(
      (await f.request("/api/dispatcher/processes", { role: "vendedor" })).status,
      200,
    );
    assert.equal(
      (await create({}, { role: "vendedor" })).status,
      403,
    );
    assert.equal(
      (await create({}, { role: "financeiro" })).status,
      403,
    );
  });

  await t.test("criação valida vínculos e monta checklist padrão", async () => {
    assert.equal((await create({ service_type: "invalido" })).status, 400);
    assert.equal((await create({ vehicle_id: 999 })).status, 404);
    assert.equal((await create({ customer_id: 999 })).status, 409);
    assert.equal((await create({ sale_id: 1, vehicle_id: 1 })).status, 201);
    const r = await create({ priority: "alta", expected_deadline: "2030-01-01" });
    assert.equal(r.status, 201);
    p = r.data.process;
    assert.equal(p.status, "novo_processo");
    const d = await detail(p.id);
    assert.equal(d.documents.length, 10);
    assert.ok(d.documents.some((doc) => doc.name === "CRLV-e" && doc.is_required));
    assert.equal(d.timeline.length, 1);
    assert.equal(d.timeline[0].event_type, "created");
  });

  await t.test("edição usa concorrência otimista", async () => {
    const ok = await f.request(`/api/dispatcher/processes/${p.id}`, {
      method: "PUT",
      body: { version: p.version, priority: "urgente", notes: "Prioridade alta" },
    });
    assert.equal(ok.status, 200);
    const stale = await f.request(`/api/dispatcher/processes/${p.id}`, {
      method: "PUT",
      body: { version: p.version, priority: "baixa" },
    });
    assert.equal(stale.status, 409);
    p = (await detail(p.id)).process;
    assert.equal(p.priority, "urgente");
  });

  await t.test("mudança de status grava histórico e exige motivo ao cancelar", async () => {
    const same = await f.request(`/api/dispatcher/processes/${p.id}/status`, {
      method: "PATCH",
      body: { version: p.version, status: "novo_processo" },
    });
    assert.equal(same.status, 400);
    const moved = await f.request(`/api/dispatcher/processes/${p.id}/status`, {
      method: "PATCH",
      body: { version: p.version, status: "aguardando_documentos", note: "Aguardando cliente enviar RG." },
    });
    assert.equal(moved.status, 200);
    p = (await detail(p.id)).process;
    const noReason = await f.request(`/api/dispatcher/processes/${p.id}/status`, {
      method: "PATCH",
      body: { version: p.version, status: "cancelado" },
    });
    assert.equal(noReason.status, 400);
    const d = await detail(p.id);
    assert.equal(d.timeline[0].event_type, "status_changed");
    assert.equal(d.timeline[0].previous_status, "novo_processo");
    assert.equal(d.timeline[0].new_status, "aguardando_documentos");
    assert.match(d.timeline[0].content, /Aguardando cliente enviar RG\./);
  });

  await t.test("checklist: aprovar, rejeitar exige motivo, excluir", async () => {
    const doc = (await detail(p.id)).documents.find((x) => x.name === "CRLV-e");
    const rejectNoReason = await f.request(`/api/dispatcher/documents/${doc.id}`, {
      method: "PATCH",
      body: { status: "rejeitado" },
    });
    assert.equal(rejectNoReason.status, 400);
    const rejected = await f.request(`/api/dispatcher/documents/${doc.id}`, {
      method: "PATCH",
      body: { status: "rejeitado", rejection_reason: "A imagem está ilegível." },
    });
    assert.equal(rejected.status, 200);
    const approved = await f.request(`/api/dispatcher/documents/${doc.id}`, {
      method: "PATCH",
      body: { status: "aprovado" },
    });
    assert.equal(approved.status, 200);
    const added = await f.request(`/api/dispatcher/processes/${p.id}/documents`, {
      method: "POST",
      body: { name: "Extrato bancário", is_required: false },
    });
    assert.equal(added.status, 201);
    const removed = await f.request(
      `/api/dispatcher/documents/${added.data.document.id}`,
      { method: "DELETE" },
    );
    assert.equal(removed.status, 200);
    const d = await detail(p.id);
    assert.equal(d.documents.length, 10);
    assert.ok(
      d.timeline.some((e) =>
        e.content.includes("CRLV-e rejeitado: A imagem está ilegível."),
      ),
    );
  });

  await t.test("processo encerrado não aceita mais alterações", async () => {
    const done = await f.request(`/api/dispatcher/processes/${p.id}/status`, {
      method: "PATCH",
      body: { version: p.version, status: "concluido" },
    });
    assert.equal(done.status, 200);
    p = (await detail(p.id)).process;
    assert.ok(p.closed_at);
    const blocked = await f.request(`/api/dispatcher/processes/${p.id}`, {
      method: "PUT",
      body: { version: p.version, priority: "baixa" },
    });
    assert.equal(blocked.status, 409);
  });

  await t.test("prazo vencido aparece como atrasado", async () => {
    const r = await create({ expected_deadline: "2000-01-01" });
    const late = r.data.process;
    const d = await detail(late.id);
    assert.equal(d.process.overdue, true);
  });

  await t.test(
    "enviar para o despachante a partir da venda evita duplicidade",
    async () => {
      await f.db.exec(`
        INSERT INTO vehicles(brand,model,year,price,purchase_price,entry_date,status)
        VALUES('Fiat','Argo',2025,80000,65000,CURRENT_DATE-15,'sold');
        INSERT INTO sales(vehicle_id,vehicle_label,buyer_name,sale_date,sale_price,purchase_price,expenses_total,payment_method,previous_status,created_by,customer_id)
        VALUES(2,'Fiat Argo • 2025','Bruno Comprador',CURRENT_DATE,80000,65000,0,'pix','available',2,2);
      `);
      const first = await f.request("/api/dispatcher/from-sale/2", {
        method: "POST",
        role: "admin",
      });
      assert.equal(first.status, 201);
      assert.equal(first.data.created, true);
      const again = await f.request("/api/dispatcher/from-sale/2", {
        method: "POST",
        role: "admin",
      });
      assert.equal(again.status, 200);
      assert.equal(again.data.created, false);
      assert.equal(again.data.process.id, first.data.process.id);
    },
  );

  await t.test(
    "vendedor só enxerga processos ligados às próprias vendas",
    async () => {
      const owner = await f.request("/api/dispatcher/processes", {
        role: "vendedor",
        userId: 2,
      });
      const ownProcess = owner.data.processes.find((x) => x.sale_id === 2);
      assert.ok(ownProcess);
      const stranger = await f.request("/api/dispatcher/processes", {
        role: "vendedor",
        userId: 99,
      });
      assert.ok(!stranger.data.processes.some((x) => x.sale_id === 2));
      const strangerDetail = await f.request(
        `/api/dispatcher/processes/${ownProcess.id}`,
        { role: "vendedor", userId: 99 },
      );
      assert.equal(strangerDetail.status, 404);
    },
  );

  await t.test("exclusão de processo exige role de gestão", async () => {
    const created = (await create({})).data.process;
    assert.equal(
      (
        await f.request(`/api/dispatcher/processes/${created.id}`, {
          method: "DELETE",
          role: "vendedor",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(`/api/dispatcher/processes/${created.id}`, {
          method: "DELETE",
          role: "despachante",
        })
      ).status,
      200,
    );
  });
});
