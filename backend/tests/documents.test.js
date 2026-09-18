const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/documents-fixture");

test("documentação: autenticação, validação, ciclo de status, listagem e exclusão", async (t) => {
  const f = await fixture();
  t.after(() => f.close());

  await f.db.exec(`INSERT INTO vehicles(brand,model,year,price,status,license_plate,renavam,chassis_number) VALUES
    ('Chevrolet','Camaro',2024,350000,'available','ABC1D23','12345678901','9BWZZZ377VT004251');
    INSERT INTO customers(name,phone,created_by) VALUES ('Marcos Silva','11999990000',1);`);

  const validBody = {
    document_type: "procuracao",
    vehicle_id: 1,
    client_id: 1,
    participant_primary: { name: "Marcos Silva", document: "12345678901" },
    participant_secondary: { name: "Car Dealer Veículos Ltda." },
    vehicle_snapshot: { label: "Chevrolet Camaro • 2024" },
    document_data: { finalidade: "Transferência e regularização do veículo" },
    issue_date: "2026-01-10",
  };

  await t.test(
    "rotas exigem autenticação e papel admin",
    async () => {
      assert.equal((await f.request("/api/documents", { role: null })).status, 401);
      assert.equal(
        (await f.request("/api/documents", { role: "vendedor" })).status,
        403,
      );
      assert.equal(
        (await f.request("/api/documents", { role: "despachante" })).status,
        403,
      );
      assert.equal((await f.request("/api/documents")).status, 200);
    },
  );

  await t.test("validação recusa dados incompletos ou inválidos", async () => {
    for (const patch of [
      { document_type: "invalido" },
      { participant_primary: { name: "" } },
      { participant_primary: { name: "Marcos", document: "123" } },
      { vehicle_id: "1 OR 1=1" },
      { client_id: "abc" },
      { issue_date: "2026-99-99" },
      { operation_value: -10 },
      { participant_primary: { name: "Marcos", nested: { a: 1 } } },
    ]) {
      const result = await f.request("/api/documents", {
        method: "POST",
        body: { ...validBody, ...patch },
      });
      assert.equal(result.status, 400, JSON.stringify(patch));
    }
  });

  let documentId;
  let version;
  await t.test("cria rascunho com título automático", async () => {
    const result = await f.request("/api/documents", {
      method: "POST",
      body: validBody,
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.document.status, "draft");
    assert.equal(result.data.document.title, "Procuração • Chevrolet Camaro • 2024");
    assert.equal(result.data.document.participant_primary.name, "Marcos Silva");
    documentId = result.data.document.id;
    version = result.data.document.version;
  });

  await t.test("script em observações é guardado como texto puro", async () => {
    const malicious = "<script>alert(1)</script>";
    const result = await f.request("/api/documents", {
      method: "POST",
      body: {
        ...validBody,
        document_data: { observacoes: malicious },
      },
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.document.document_data.observacoes, malicious);
  });

  await t.test("listagem, busca e filtros", async () => {
    const all = await f.request("/api/documents");
    assert.equal(all.data.documents.length, 2);
    assert.ok(all.data.pagination);

    const byType = await f.request("/api/documents?type=procuracao");
    assert.equal(byType.data.documents.length, 2);

    const byStatus = await f.request("/api/documents?status=completed");
    assert.equal(byStatus.data.documents.length, 0);

    const bySearch = await f.request("/api/documents?search=Marcos");
    assert.ok(bySearch.data.documents.length >= 1);

    const badType = await f.request("/api/documents?type=invalido");
    assert.equal(badType.status, 400);
  });

  await t.test("GET por id valida o id e retorna 404 quando ausente", async () => {
    assert.equal((await f.request("/api/documents/abc")).status, 400);
    assert.equal((await f.request("/api/documents/999")).status, 404);
    const found = await f.request(`/api/documents/${documentId}`);
    assert.equal(found.status, 200);
    assert.equal(found.data.document.id, documentId);
  });

  await t.test("PUT atualiza com controle de versão otimista", async () => {
    const stale = await f.request(`/api/documents/${documentId}`, {
      method: "PUT",
      body: { ...validBody, version: version + 5 },
    });
    assert.equal(stale.status, 409);

    const updated = await f.request(`/api/documents/${documentId}`, {
      method: "PUT",
      body: {
        ...validBody,
        version,
        document_data: { finalidade: "Finalidade atualizada" },
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(
      updated.data.document.document_data.finalidade,
      "Finalidade atualizada",
    );
    version = updated.data.document.version;
  });

  await t.test("status: transições permitidas e bloqueadas", async () => {
    assert.equal(
      (
        await f.request(`/api/documents/${documentId}/status`, {
          method: "PATCH",
          body: { status: "invalido", version },
        })
      ).status,
      400,
    );

    const toAwaiting = await f.request(`/api/documents/${documentId}/status`, {
      method: "PATCH",
      body: { status: "awaiting_signature", version },
    });
    assert.equal(toAwaiting.status, 200);
    version = toAwaiting.data.document.version;

    const staleVersion = await f.request(
      `/api/documents/${documentId}/status`,
      { method: "PATCH", body: { status: "completed", version: version + 9 } },
    );
    assert.equal(staleVersion.status, 409);

    const toCompleted = await f.request(`/api/documents/${documentId}/status`, {
      method: "PATCH",
      body: { status: "completed", version },
    });
    assert.equal(toCompleted.status, 200);
    assert.ok(toCompleted.data.document.completed_at);
    version = toCompleted.data.document.version;

    const backToDraft = await f.request(`/api/documents/${documentId}/status`, {
      method: "PATCH",
      body: { status: "draft", version },
    });
    assert.equal(
      backToDraft.status,
      409,
      "documento concluído só pode ser cancelado, não reaberto",
    );

    const cancelWithoutReason = await f.request(
      `/api/documents/${documentId}/status`,
      { method: "PATCH", body: { status: "cancelled", version } },
    );
    assert.equal(cancelWithoutReason.status, 400);

    const cancelled = await f.request(`/api/documents/${documentId}/status`, {
      method: "PATCH",
      body: { status: "cancelled", version, reason: "Erro de cadastro" },
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.document.cancellation_reason, "Erro de cadastro");
  });

  await t.test(
    "exclusão: bloqueia documento concluído, permite rascunho e cancelado",
    async () => {
      assert.equal(
        (await f.request("/api/documents/abc", { method: "DELETE" })).status,
        400,
      );
      assert.equal(
        (await f.request("/api/documents/999", { method: "DELETE" })).status,
        404,
      );

      // documentId está "cancelled" (fim do bloco anterior) — cancelado pode ser excluído.
      const deletedCancelled = await f.request(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      assert.equal(deletedCancelled.status, 200);

      const draft = await f.request("/api/documents", {
        method: "POST",
        body: validBody,
      });
      const deletedDraft = await f.request(
        `/api/documents/${draft.data.document.id}`,
        { method: "DELETE" },
      );
      assert.equal(deletedDraft.status, 200);
      assert.equal(
        (await f.request(`/api/documents/${draft.data.document.id}`)).status,
        404,
      );

      const completedFlow = await f.request("/api/documents", {
        method: "POST",
        body: validBody,
      });
      const completedId = completedFlow.data.document.id;
      let v = completedFlow.data.document.version;
      const awaiting = await f.request(`/api/documents/${completedId}/status`, {
        method: "PATCH",
        body: { status: "awaiting_signature", version: v },
      });
      v = awaiting.data.document.version;
      const completed = await f.request(`/api/documents/${completedId}/status`, {
        method: "PATCH",
        body: { status: "completed", version: v },
      });
      assert.equal(completed.status, 200);
      const blockedDelete = await f.request(`/api/documents/${completedId}`, {
        method: "DELETE",
      });
      assert.equal(blockedDelete.status, 409);
    },
  );

  await t.test("resumo (summary) reflete os documentos existentes", async () => {
    const summary = await f.request("/api/documents/summary");
    assert.equal(summary.status, 200);
    assert.ok(summary.data.generatedThisMonth >= 2);
    assert.ok("awaitingSignature" in summary.data);
    assert.ok("completed" in summary.data);
    assert.ok("withIssues" in summary.data);
  });
});
