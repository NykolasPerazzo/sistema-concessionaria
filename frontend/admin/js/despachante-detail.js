(() => {
  try {
    document.body.classList.toggle(
      "light-theme",
      localStorage.getItem("carDealerAdminTheme") === "light",
    );
  } catch {}
  const $ = (id) => document.getElementById(id);
  const money = (value) =>
    value == null
      ? "Não informado"
      : Number(value).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
  const date = (value) =>
    value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
  const datetime = (value) =>
    value ? new Date(value).toLocaleString("pt-BR") : "—";

  const SERVICE_TYPES = {
    transferencia_propriedade: "Transferência de propriedade",
    transferencia_municipio: "Transferência de município",
    primeiro_emplacamento: "Primeiro emplacamento",
    licenciamento: "Licenciamento",
    comunicacao_venda: "Comunicação de venda",
    vistoria: "Vistoria",
    segunda_via_documento: "Segunda via de documento",
    regularizacao_debitos: "Regularização de débitos",
    baixa_inclusao_gravame: "Baixa ou inclusão de gravame",
    alteracao_cadastral: "Alteração cadastral",
    outro_servico: "Outro serviço",
  };
  const STATUSES = {
    novo_processo: "Novo processo",
    aguardando_documentos: "Aguardando documentos",
    documentacao_conferencia: "Documentação em conferência",
    documentacao_pendente: "Documentação pendente",
    aguardando_pagamento: "Aguardando pagamento",
    vistoria_agendada: "Vistoria agendada",
    em_processamento: "Em processamento",
    aguardando_orgao_publico: "Aguardando órgão público",
    concluido: "Concluído",
    cancelado: "Cancelado",
    com_problema: "Com problema",
  };
  const CLOSED_STATUSES = ["concluido", "cancelado"];
  const PRIORITY_LABELS = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" };
  const DOC_STATUSES = {
    pendente: "Pendente",
    enviado: "Enviado",
    em_analise: "Em análise",
    aprovado: "Aprovado",
    rejeitado: "Rejeitado",
    nao_aplicavel: "Não aplicável",
  };
  const DOC_BADGE = {
    pendente: "dispatcher-badge-neutro",
    enviado: "dispatcher-badge-atencao",
    em_analise: "dispatcher-badge-atencao",
    aprovado: "dispatcher-badge-sucesso",
    rejeitado: "dispatcher-badge-problema",
    nao_aplicavel: "dispatcher-badge-neutro",
  };
  const EVENT_LABELS = {
    created: "Processo criado",
    updated: "Dados atualizados",
    status_changed: "Status alterado",
    document_added: "Documento adicionado",
    document_updated: "Documento atualizado",
    document_approved: "Documento aprovado",
    document_rejected: "Documento rejeitado",
    document_removed: "Documento removido",
  };

  const processId = new URLSearchParams(location.search).get("id");
  let process = null,
    documents = [],
    timeline = [],
    users = [],
    role = null,
    busy = false;

  function message(id, text = "", error = false) {
    const el = $(id);
    el.textContent = text;
    el.hidden = !text;
    el.className = `sales-message ${error ? "error" : "success"}`;
  }
  function node(tag, text, className) {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function fillSelect(select, entries, placeholder) {
    select.replaceChildren(new Option(placeholder, ""));
    entries.forEach(([value, label]) => select.add(new Option(label, value)));
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_URL}/dispatcher${path}`, {
      credentials: "include",
      ...options,
    });
    if (response.status === 401) {
      window.location.href = "./login.html";
      throw new Error("Sua sessão expirou.");
    }
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Não foi possível carregar os dados.");
    return data;
  }
  async function apiRaw(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      ...options,
    });
    if (response.status === 401) {
      window.location.href = "./login.html";
      throw new Error("Sua sessão expirou.");
    }
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Não foi possível carregar os dados.");
    return data;
  }
  const send = (path, method, body) =>
    api(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  function canManage() {
    return ["admin", "despachante"].includes(role);
  }

  function renderSummary() {
    $("pageTitle").textContent = `Processo #${process.id}`;
    $("pageSubtitle").textContent = SERVICE_TYPES[process.service_type] || process.service_type;
    const dl = $("summaryDetails");
    dl.replaceChildren();
    [
      ["Número do processo", `#${process.id}`],
      ["Tipo de serviço", SERVICE_TYPES[process.service_type] || process.service_type],
      ["Status", STATUSES[process.status] || process.status],
      ["Prioridade", PRIORITY_LABELS[process.priority]],
      ["Responsável", process.responsible_name || "Não definido"],
      ["Prazo previsto", date(process.expected_deadline)],
      ["Valor estimado", money(process.estimated_value)],
      ["Criado em", datetime(process.created_at)],
      ["Última atualização", datetime(process.updated_at)],
      ["Concluído em", process.closed_at ? datetime(process.closed_at) : "—"],
    ].forEach(([label, value]) => {
      const div = document.createElement("div");
      div.append(node("dt", label), node("dd", String(value)));
      dl.append(div);
    });
    if (process.cancellation_reason)
      dl.lastElementChild.after(
        (() => {
          const div = document.createElement("div");
          div.append(node("dt", "Motivo do cancelamento"), node("dd", process.cancellation_reason));
          return div;
        })(),
      );
    if (process.notes) $("notesText").textContent = process.notes;
    else $("notesText").textContent = "Sem observações registradas.";

    $("summaryActions").replaceChildren();
    if (canManage() && !CLOSED_STATUSES.includes(process.status)) {
      const statusBtn = node("button", "Alterar status", "sales-secondary");
      statusBtn.type = "button";
      statusBtn.addEventListener("click", openStatusDialog);
      const editBtn = node("button", "Editar dados", "sales-secondary");
      editBtn.type = "button";
      editBtn.addEventListener("click", openEditDialog);
      $("summaryActions").append(statusBtn, editBtn);
    }
    if (canManage()) {
      const deleteBtn = node("button", "Excluir processo", "sales-secondary sales-danger");
      deleteBtn.type = "button";
      deleteBtn.addEventListener("click", deleteProcess);
      $("summaryActions").append(deleteBtn);
    }
  }

  function renderRelations() {
    const customerBox = $("customerDetails");
    customerBox.replaceChildren();
    const customerLink = node("a", process.customer_name, "customer-history-item");
    customerLink.href = `./customers.html?customer=${process.customer_id}`;
    customerLink.append(node("small", process.customer_phone || "Sem telefone"));
    customerBox.append(customerLink);

    const vehicleBox = $("vehicleDetails");
    vehicleBox.replaceChildren();
    const vehicleLink = node(
      "a",
      `${process.vehicle_brand} ${process.vehicle_model}`,
      "customer-history-item",
    );
    vehicleLink.href = `./vehicle-form.html?id=${process.vehicle_id}`;
    vehicleLink.append(node("small", `Ano ${process.vehicle_year}`));
    vehicleBox.append(vehicleLink);

    const saleBox = $("saleDetails");
    saleBox.replaceChildren();
    if (process.sale_id) {
      const saleLink = node("a", `Venda #${process.sale_id}`, "customer-history-item");
      saleLink.href = `./sales.html?sale=${process.sale_id}`;
      saleLink.append(
        node("small", `${process.sale_buyer_name || ""} • ${date(process.sale_date)}`),
      );
      saleBox.append(saleLink);
    } else {
      saleBox.append(node("p", "Nenhuma venda vinculada.", "sales-footnote"));
    }
  }

  function renderChecklist() {
    $("checklistCount").textContent = `${documents.length} item(ns)`;
    const box = $("checklistList");
    box.replaceChildren();
    if (!documents.length) {
      box.append(node("p", "Nenhum item no checklist.", "sales-footnote"));
    }
    documents.forEach((doc) => {
      const item = document.createElement("div");
      item.className = `checklist-item ${!doc.is_required ? "checklist-optional" : ""} ${doc.status === "rejeitado" ? "checklist-rejected" : ""}`;
      const head = document.createElement("div");
      head.className = "checklist-item-head";
      head.append(
        node("strong", `${doc.name}${!doc.is_required ? " (opcional)" : ""}`),
        node("span", DOC_STATUSES[doc.status], `dispatcher-badge ${DOC_BADGE[doc.status]}`),
      );
      item.append(head);
      if (doc.description) item.append(node("small", doc.description));
      if (doc.status === "rejeitado" && doc.rejection_reason)
        item.append(node("small", `Motivo: ${doc.rejection_reason}`));
      if (canManage() && !CLOSED_STATUSES.includes(process.status)) {
        const actions = document.createElement("div");
        actions.className = "checklist-item-actions";
        if (doc.status !== "enviado")
          actions.append(actionButton("Marcar como enviado", () => updateDocument(doc.id, { status: "enviado" })));
        if (!["aprovado"].includes(doc.status))
          actions.append(actionButton("Aprovar", () => updateDocument(doc.id, { status: "aprovado" })));
        if (doc.status !== "rejeitado")
          actions.append(
            actionButton("Rejeitar", () => {
              const reason = prompt(`Motivo da rejeição de "${doc.name}":`);
              if (reason && reason.trim())
                updateDocument(doc.id, { status: "rejeitado", rejection_reason: reason.trim() });
            }),
          );
        if (doc.status !== "nao_aplicavel")
          actions.append(actionButton("Não aplicável", () => updateDocument(doc.id, { status: "nao_aplicavel" })));
        const removeBtn = actionButton("Excluir", () => {
          if (confirm(`Excluir o item "${doc.name}" do checklist?`)) deleteDocument(doc.id);
        });
        removeBtn.classList.add("sales-danger");
        actions.append(removeBtn);
        item.append(actions);
      }
      box.append(item);
    });
  }

  function actionButton(text, handler) {
    const btn = node("button", text, "sales-secondary");
    btn.type = "button";
    btn.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      try {
        await handler();
        await reload();
      } catch (error) {
        message("pageMessage", error.message, true);
      } finally {
        busy = false;
      }
    });
    return btn;
  }

  async function updateDocument(id, body) {
    await send(`/documents/${id}`, "PATCH", body);
  }
  async function deleteDocument(id) {
    await send(`/documents/${id}`, "DELETE");
  }

  function renderTimeline() {
    const box = $("eventList");
    box.replaceChildren();
    if (!timeline.length) {
      box.append(node("p", "Nenhum evento registrado ainda.", "sales-footnote"));
      return;
    }
    timeline.forEach((event) => {
      const p = document.createElement("p");
      p.textContent = `${datetime(event.created_at)} — ${event.content}`;
      box.append(p);
    });
  }

  async function reload() {
    const data = await api(`/processes/${processId}`);
    process = data.process;
    documents = data.documents;
    timeline = data.timeline;
    renderSummary();
    renderRelations();
    renderChecklist();
    renderTimeline();
  }

  function openStatusDialog() {
    message("statusMessage");
    const options = Object.keys(STATUSES).filter((s) => s !== process.status);
    fillSelect($("statusSelect"), options.map((s) => [s, STATUSES[s]]), "Selecione");
    $("statusForm").reset();
    $("reasonField").hidden = true;
    $("statusDialog").showModal();
  }
  document.addEventListener("change", (e) => {
    if (e.target.id === "statusSelect")
      $("reasonField").hidden = e.target.value !== "cancelado";
  });

  $("statusForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    $("confirmStatus").disabled = true;
    message("statusMessage");
    try {
      const body = Object.fromEntries(new FormData(e.target));
      body.version = process.version;
      await send(`/processes/${process.id}/status`, "PATCH", body);
      $("statusDialog").close();
      message("pageMessage", "Status atualizado.");
      await reload();
    } catch (error) {
      message("statusMessage", error.message, true);
    } finally {
      busy = false;
      $("confirmStatus").disabled = false;
    }
  });

  async function openEditDialog() {
    message("editMessage");
    const usersData = await apiRaw("/users").catch(() => ({ users: [] }));
    users = (usersData.users || []).filter((u) => u.role !== "vendedor");
    fillSelect(
      $("editResponsibleSelect"),
      users.map((u) => [u.id, u.name]),
      "Sem responsável definido",
    );
    const form = $("editForm");
    form.elements.priority.value = process.priority;
    form.elements.responsible_user_id.value = process.responsible_user_id || "";
    form.elements.expected_deadline.value = process.expected_deadline || "";
    form.elements.estimated_value.value = process.estimated_value || "";
    form.elements.notes.value = process.notes || "";
    $("editDialog").showModal();
  }

  $("editForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    $("confirmEdit").disabled = true;
    message("editMessage");
    try {
      const body = Object.fromEntries(new FormData(e.target));
      body.version = process.version;
      await send(`/processes/${process.id}`, "PUT", body);
      $("editDialog").close();
      message("pageMessage", "Processo atualizado.");
      await reload();
    } catch (error) {
      message("editMessage", error.message, true);
    } finally {
      busy = false;
      $("confirmEdit").disabled = false;
    }
  });

  async function deleteProcess() {
    if (!confirm("Excluir este processo? Documentos e histórico serão apagados.")) return;
    if (busy) return;
    busy = true;
    try {
      await send(`/processes/${process.id}`, "DELETE");
      location.href = "./despachante.html";
    } catch (error) {
      message("pageMessage", error.message, true);
      busy = false;
    }
  }

  $("addDocumentForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    message("pageMessage");
    try {
      const form = e.target;
      const body = {
        name: form.elements.name.value,
        is_required: form.elements.is_required.checked,
      };
      await send(`/processes/${process.id}/documents`, "POST", body);
      form.reset();
      form.elements.is_required.checked = true;
      await reload();
    } catch (error) {
      message("pageMessage", error.message, true);
    } finally {
      busy = false;
    }
  });

  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => {
      if (!busy) $(b.dataset.close).close();
    }),
  );
  ["statusDialog", "editDialog"].forEach((id) =>
    $(id).addEventListener("cancel", (e) => {
      if (busy) e.preventDefault();
    }),
  );

  requireAuth().then(async (user) => {
    if (!user) return;
    role = user.role;
    if (!processId) {
      message("pageMessage", "Processo não informado.", true);
      return;
    }
    try {
      await reload();
    } catch (error) {
      message("pageMessage", error.message, true);
    }
  });
})();
