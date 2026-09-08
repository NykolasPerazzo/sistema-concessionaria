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
      ? "—"
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
  const STATUS_BADGE = {
    novo_processo: "dispatcher-badge-neutro",
    aguardando_documentos: "dispatcher-badge-atencao",
    documentacao_conferencia: "dispatcher-badge-neutro",
    documentacao_pendente: "dispatcher-badge-atencao",
    aguardando_pagamento: "dispatcher-badge-atencao",
    vistoria_agendada: "dispatcher-badge-neutro",
    em_processamento: "dispatcher-badge-neutro",
    aguardando_orgao_publico: "dispatcher-badge-neutro",
    concluido: "dispatcher-badge-sucesso",
    cancelado: "dispatcher-badge-neutro",
    com_problema: "dispatcher-badge-problema",
  };
  const PRIORITY_LABELS = {
    baixa: "Baixa",
    normal: "Normal",
    alta: "Alta",
    urgente: "Urgente",
  };

  let processes = [],
    vehicles = [],
    customers = [],
    users = [],
    role = null,
    submitting = false,
    requestVersion = 0;

  function message(id, text = "", error = false) {
    const el = $(id);
    el.textContent = text;
    el.hidden = !text;
    el.className = `sales-message ${error ? "error" : "success"}`;
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

  async function apiRaw(base, path, options = {}) {
    const response = await fetch(`${API_URL}${base}${path}`, {
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

  function node(tag, text, className) {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function cell(row, text, cls) {
    const td = node("td", text, cls);
    row.append(td);
    return td;
  }

  function fillSelect(select, entries, placeholder) {
    select.replaceChildren(new Option(placeholder, ""));
    entries.forEach(([value, label]) => select.add(new Option(label, value)));
  }

  async function loadReferenceData() {
    fillSelect($("statusFilter"), Object.entries(STATUSES), "Todos");
    fillSelect($("typeFilter"), Object.entries(SERVICE_TYPES), "Todos");
    document
      .querySelectorAll('#processForm select[name="service_type"]')
      .forEach((select) =>
        fillSelect(select, Object.entries(SERVICE_TYPES), "Selecione"),
      );
    const [vehiclesData, customersData, usersData] = await Promise.all([
      apiRaw("/vehicles", ""),
      apiRaw("/customers", "?active=true"),
      apiRaw("/users", ""),
    ]);
    vehicles = vehiclesData.vehicles || [];
    customers = customersData.customers || [];
    users = (usersData.users || []).filter((u) => u.role !== "vendedor");
    fillSelect(
      $("responsibleFilter"),
      users.map((u) => [u.id, u.name]),
      "Todos",
    );
    fillSelect(
      $("responsibleSelect"),
      users.map((u) => [u.id, u.name]),
      "Sem responsável definido",
    );
    fillSelect(
      $("vehicleSelect"),
      vehicles.map((v) => [v.id, `${v.brand} ${v.model} • ${v.year} • #${v.id}`]),
      "Selecione um veículo",
    );
    fillSelect(
      $("customerSelect"),
      customers.map((c) => [c.id, c.name]),
      "Selecione um cliente",
    );
  }

  function buildParams() {
    const params = new URLSearchParams();
    if ($("statusFilter").value) params.set("status", $("statusFilter").value);
    if ($("typeFilter").value) params.set("service_type", $("typeFilter").value);
    if ($("priorityFilter").value) params.set("priority", $("priorityFilter").value);
    if ($("responsibleFilter").value)
      params.set("responsible", $("responsibleFilter").value);
    if ($("overdueFilter").checked) params.set("overdue", "true");
    if ($("search").value.trim()) params.set("search", $("search").value.trim());
    return params;
  }

  async function loadProcesses() {
    const version = ++requestVersion;
    try {
      const params = buildParams();
      const data = await api(`/processes?${params}`);
      if (version !== requestVersion) return;
      processes = data.processes;
      renderStats();
      renderTable();
    } catch (error) {
      if (version !== requestVersion) return;
      processes = [];
      renderTable();
      throw error;
    }
  }

  function renderStats() {
    const active = processes.filter((p) => !["concluido", "cancelado"].includes(p.status));
    const in7days = new Date();
    in7days.setDate(in7days.getDate() + 7);
    const dueSoon = active.filter(
      (p) =>
        p.expected_deadline &&
        !p.overdue &&
        new Date(`${p.expected_deadline}T00:00:00`) <= in7days,
    );
    $("statActive").textContent = active.length;
    $("statPendingDocs").textContent = processes.reduce(
      (sum, p) => sum + Number(p.pending_required_documents || 0),
      0,
    );
    $("statOverdue").textContent = processes.filter((p) => p.overdue).length;
    $("statDueSoon").textContent = dueSoon.length;
    $("statDone").textContent = processes.filter((p) => p.status === "concluido").length;
    $("statProblem").textContent = processes.filter((p) => p.status === "com_problema").length;
  }

  function renderTable() {
    $("recordCount").textContent = `${processes.length} processo(s)`;
    $("processRows").replaceChildren();
    if (!processes.length) {
      const row = document.createElement("tr");
      cell(
        row,
        "Nenhum processo encontrado. Abra um novo processo ou ajuste os filtros.",
        "sales-empty",
      ).colSpan = 9;
      $("processRows").append(row);
      return;
    }
    processes.forEach((p) => {
      const row = document.createElement("tr");
      const client = cell(row, "");
      client.append(node("strong", p.customer_name));
      const vehicle = cell(row, "");
      vehicle.append(node("strong", `${p.vehicle_brand} ${p.vehicle_model}`), node("small", `${p.vehicle_year}`));
      cell(row, SERVICE_TYPES[p.service_type] || p.service_type);
      const statusCell = cell(row, "");
      statusCell.append(
        node("span", STATUSES[p.status] || p.status, `dispatcher-badge ${STATUS_BADGE[p.status] || ""}`),
      );
      const priorityCell = cell(row, "");
      priorityCell.append(
        node("span", PRIORITY_LABELS[p.priority], `dispatcher-priority dispatcher-priority-${p.priority}`),
      );
      cell(row, p.responsible_name || "Não definido");
      const deadlineCell = cell(row, date(p.expected_deadline), p.overdue ? "dispatcher-overdue" : "");
      cell(row, datetime(p.updated_at));
      const actions = cell(row, "");
      const link = node("a", "Ver detalhes", "sales-secondary");
      link.href = `./despachante-detail.html?id=${p.id}`;
      actions.append(link);
      $("processRows").append(row);
    });
  }

  async function openDialog(prefill = {}) {
    if (submitting) return;
    message("formMessage");
    $("processForm").reset();
    if (prefill.vehicle_id) $("vehicleSelect").value = prefill.vehicle_id;
    if (prefill.customer_id) $("customerSelect").value = prefill.customer_id;
    $("processDialog").showModal();
  }

  $("newProcessButton").addEventListener("click", () => openDialog());
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => {
      if (!submitting) $(b.dataset.close).close();
    }),
  );
  $("processDialog").addEventListener("cancel", (e) => {
    if (submitting) e.preventDefault();
  });

  $("filters").addEventListener("submit", async (e) => {
    e.preventDefault();
    message("pageMessage");
    try {
      await loadProcesses();
    } catch (error) {
      message("pageMessage", error.message, true);
    }
  });
  $("clearFilters").addEventListener("click", () => {
    $("filters").reset();
    $("filters").requestSubmit();
  });

  $("processForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return;
    submitting = true;
    $("confirmProcess").disabled = true;
    message("formMessage");
    try {
      const body = Object.fromEntries(new FormData(e.target));
      await api("/processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      $("processDialog").close();
      message("pageMessage", "Processo criado com sucesso.");
      try {
        await loadProcesses();
      } catch {
        message(
          "pageMessage",
          "Processo criado. Clique em Filtrar para recarregar a lista.",
          true,
        );
      }
    } catch (error) {
      message("formMessage", error.message, true);
    } finally {
      submitting = false;
      $("confirmProcess").disabled = false;
    }
  });

  requireAuth().then(async (user) => {
    if (!user) return;
    role = user.role;
    try {
      await loadReferenceData();
      if (["admin", "despachante"].includes(role)) {
        $("newProcessButton").disabled = false;
      } else {
        $("newProcessButton").hidden = true;
      }
      await loadProcesses();
      const params = new URLSearchParams(location.search);
      if (params.get("vehicle") || params.get("customer")) {
        if (["admin", "despachante"].includes(role)) {
          openDialog({
            vehicle_id: params.get("vehicle"),
            customer_id: params.get("customer"),
          });
        }
      }
    } catch (error) {
      message("pageMessage", error.message, true);
    }
  });
})();
