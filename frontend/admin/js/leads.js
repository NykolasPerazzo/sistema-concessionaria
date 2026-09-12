(() => {
  try {
    document.body.classList.toggle(
      "light-theme",
      localStorage.getItem("carDealerAdminTheme") === "light",
    );
  } catch {}

  const $ = (id) => document.getElementById(id);
  const money = (n) =>
    Number(n).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const stages = {
    new: "Novo",
    contacting: "Em atendimento",
    qualified: "Qualificado",
    lost: "Perdido",
    converted: "Convertido",
  };

  const sources = {
    website: "Site",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    facebook: "Facebook",
    referral: "Indicação",
    walkin: "Visita à loja",
    other: "Outra",
  };

  const paymentLabels = {
    cash: "À vista",
    financing: "Financiado",
  };

  const timeframeLabels = {
    immediate: "Compra imediata",
    "7_days": "Em até 7 dias",
    "30_days": "Em até 30 dias",
    "90_days": "Em até 90 dias",
    research_only: "Ainda só pesquisando",
  };

  const triLabels = {
    true: "Sim",
    false: "Não",
  };

  const triProbabilityLabels = {
    low: "Baixa",
    medium: "Média",
    high: "Alta",
  };

  const analysisStatusLabels = {
    ok: "Concluída",
    error: "Falhou",
  };

  const temperatureInfo = {
    hot: {
      label: "Quente",
      cls: "lead-hot",
    },
    warm: {
      label: "Morno",
      cls: "lead-warm",
    },
    cold: {
      label: "Frio",
      cls: "lead-cold",
    },
  };

  const preferenceLabels = {
    profession: "Profissão",
    family_profile: "Perfil familiar",
    vehicle_category: "Categoria de veículo desejada",
    min_year: "Ano mínimo",
    transmission: "Câmbio",
    fuel: "Combustível",
    seats: "Lugares",
    usage_purpose: "Finalidade de uso",
    preferred_contact: "Forma preferida de contato",
  };

  let leads = [];
  let editing = null;
  let selected = null;
  let busy = false;
  let requestVersion = 0;
  let users = [];
  let usersById = {};

  function temperatureOf(score) {
    if (score == null) return null;
    if (score >= 70) return "hot";
    if (score >= 40) return "warm";
    return "cold";
  }

  function date(value) {
    return value
      ? value.slice(0, 10).split("-").reverse().join("/")
      : "Não definido";
  }

  const sourceIcons = {
    website: "fa-solid fa-globe",
    whatsapp: "fa-brands fa-whatsapp",
    instagram: "fa-brands fa-instagram",
    facebook: "fa-brands fa-facebook",
    referral: "fa-solid fa-share-nodes",
    walkin: "fa-solid fa-store",
    other: "fa-solid fa-ellipsis",
  };

  const avatarColors = [
    "#ff5a2e",
    "#3d8bff",
    "#8b6bff",
    "#22c55e",
    "#f5a623",
    "#ec4899",
  ];

  function avatarColor(name) {
    const sum = String(name || "")
      .split("")
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

    return avatarColors[sum % avatarColors.length];
  }

  function initials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!parts.length) return "?";

    return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
  }

  function timeAgo(value) {
    if (!value) return "";

    const diffMs = Date.now() - new Date(value).getTime();

    if (!Number.isFinite(diffMs) || diffMs < 0) return "";

    const minutes = Math.floor(diffMs / 60000);

    if (minutes < 1) return "agora";
    if (minutes < 60) return `${minutes}min`;

    const hours = Math.floor(minutes / 60);

    if (hours < 24) return `${hours}h`;

    return `${Math.floor(hours / 24)}d`;
  }

  function el(tag, text, cls) {
    const node = document.createElement(tag);
    node.textContent = text;

    if (cls) {
      node.className = cls;
    }

    return node;
  }

  function message(id, text = "", error = false) {
    const node = $(id);

    if (!node) return;

    node.textContent = text;
    node.hidden = !text;
    node.className = `sales-message ${error ? "error" : "success"}`;
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      ...options,
    });

    if (response.status === 401) {
      location.href = "./login.html";
      throw new Error("Sua sessão expirou.");
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível carregar os leads.");
    }

    return data;
  }

  function send(path, method, body) {
    return api(path, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  function render() {
    const newLeadsCount = leads.filter((lead) => lead.status === "new").length;

    $("newCount").textContent = newLeadsCount;

    document.dispatchEvent(
      new CustomEvent("leads:new-count", {
        detail: newLeadsCount,
      }),
    );

    $("activeCount").textContent = leads.filter((lead) =>
      ["contacting", "qualified"].includes(lead.status),
    ).length;

    $("overdueCount").textContent = leads.filter((lead) => lead.overdue).length;

    updateLeadsCommandInsights();

    const q = $("search").value.trim().toLocaleLowerCase("pt-BR");
    const digits = q.replace(/\D/g, "");
    const status = $("statusFilter").value;
    const source = $("sourceFilter").value;
    const assignee = $("assigneeFilter").value;

    const rows = leads.filter((lead) => {
      const matchesStatus = status === "all" || lead.status === status;
      const matchesSource = source === "all" || source === lead.source;
      const matchesReturn = $("returnFilter").value === "all" || lead.overdue;

      const matchesAssignee =
        assignee === "all" ||
        (assignee === "unassigned"
          ? lead.assigned_to == null
          : String(lead.assigned_to) === assignee);

      const searchable =
        `${lead.name} ${lead.phone || ""} ${lead.email || ""} ${
          lead.vehicle_label || ""
        }`.toLocaleLowerCase("pt-BR");

      const matchesSearch =
        searchable.includes(q) ||
        (digits.length >= 3 &&
          (lead.phone || "").replace(/\D/g, "").includes(digits));

      return (
        matchesStatus &&
        matchesSource &&
        matchesReturn &&
        matchesAssignee &&
        matchesSearch
      );
    });

    $("recordCount").textContent = `${rows.length} lead(s)`;

    const emptyColumnLabels = {
      new: "Nenhum lead novo.",
      contacting: "Nenhum lead em atendimento.",
      qualified: "Nenhum lead qualificado.",
      converted: "Nenhum lead convertido.",
      lost: "Nenhum lead perdido.",
    };

    Object.keys(emptyColumnLabels).forEach((status) => {
      const container = $(`colCards-${status}`);

      if (!container) return;

      const columnLeads = rows.filter((lead) => lead.status === status);

      $(`colCount-${status}`).textContent = String(columnLeads.length);
      container.replaceChildren();

      if (!columnLeads.length) {
        container.append(
          el("p", emptyColumnLabels[status], "lead-column-empty"),
        );

        return;
      }

      columnLeads.forEach((lead) => container.append(buildLeadCard(lead)));
    });
  }

  function buildLeadCard(lead) {
    const card = el("button", "", "lead-card");

    card.type = "button";

    const avatar = el("span", initials(lead.name), "lead-card-avatar");

    avatar.style.background = avatarColor(lead.name);

    const body = el("div", "", "lead-card-body");

    body.append(
      el("strong", lead.name, "lead-card-name"),
      el(
        "span",
        lead.vehicle_label || "Veículo não definido",
        "lead-card-interest",
      ),
    );

    const meta = el("div", "", "lead-card-meta");
    const temp = temperatureInfo[temperatureOf(lead.priority_score)];

    if (temp) {
      meta.append(el("span", temp.label, `lead-card-tag ${temp.cls}`));
    }

    const channel = el("span", "", "lead-card-channel");

    channel.append(
      el("i", "", sourceIcons[lead.source] || "fa-solid fa-circle-question"),
      document.createTextNode(sources[lead.source] || "Origem não informada"),
    );

    meta.append(channel);

    const ago = timeAgo(lead.created_at);

    if (ago) {
      meta.append(el("span", ago, "lead-card-time"));
    }

    if (lead.overdue) {
      meta.append(el("span", "Retorno vencido", "lead-card-tag lead-card-overdue"));
    }

    body.append(meta);
    card.append(avatar, body);
    card.addEventListener("click", () => details(lead.id));

    return card;
  }

  async function refresh() {
    const version = ++requestVersion;

    try {
      const data = await api("/leads");

      if (version !== requestVersion) return;

      leads = data.leads || [];
      render();
    } catch (error) {
      if (version !== requestVersion) return;

      leads = [];
      render();

      ["newCount", "activeCount", "overdueCount"].forEach((id) => {
        $(id).textContent = "—";
      });

      throw error;
    }
  }

  async function loadUsers() {
    try {
      const data = await api("/users");

      users = data.users || [];
      usersById = Object.fromEntries(users.map((user) => [user.id, user.name]));

      for (const select of [$("assignedToSelect"), $("assignSelect")]) {
        const current = select.value;

        select.replaceChildren(new Option("Não atribuído", ""));

        users.forEach((user) => {
          select.add(new Option(user.name, user.id));
        });

        select.value = current;
      }

      const filterCurrent = $("assigneeFilter").value;

      $("assigneeFilter").replaceChildren(
        new Option("Todos", "all"),
        new Option("Não atribuído", "unassigned"),
      );

      users.forEach((user) => {
        $("assigneeFilter").add(new Option(user.name, user.id));
      });

      $("assigneeFilter").value = filterCurrent || "all";
    } catch {
      // Sem lista de usuários, os seletores ficam só com "Não atribuído".
    }
  }

  async function form(lead = null) {
    if (busy) return;

    busy = true;
    message("pageMessage");

    try {
      const data = await api("/vehicles");

      editing = lead;

      $("leadForm").reset();
      message("formMessage");

      $("leadTitle").textContent = lead ? "Editar lead" : "Novo lead";
      $("vehicleSelect").replaceChildren(new Option("Ainda não definido", ""));

      data.vehicles.forEach((vehicle) => {
        $("vehicleSelect").add(
          new Option(
            `${vehicle.brand} ${vehicle.model} • ${vehicle.year} • #${
              vehicle.id
            }${vehicle.status === "sold" ? " (vendido)" : ""}`,
            vehicle.id,
          ),
        );
      });

      if (lead) {
        for (const name of [
          "name",
          "phone",
          "email",
          "city",
          "source",
          "vehicle_id",
          "budget",
          "next_contact_date",
          "notes",
          "payment_method",
          "down_payment",
          "desired_installment",
          "trade_in_estimated_value",
          "purchase_timeframe",
          "assigned_to",
        ]) {
          $("leadForm").elements[name].value = lead[name] ?? "";
        }

        const tri = (value) =>
          value === true ? "yes" : value === false ? "no" : "";

        $("leadForm").elements.has_trade_in.value = tri(lead.has_trade_in);

        $("leadForm").elements.financing_pre_approved.value = tri(
          lead.financing_pre_approved,
        );

        const prefs = lead.declared_preferences || {};

        for (const key of Object.keys(preferenceLabels)) {
          $("leadForm").elements[`pref_${key}`].value = prefs[key] ?? "";
        }
      }

      if ($("detailDialog").open) {
        $("detailDialog").close();
      }

      $("leadDialog").showModal();
    } catch (error) {
      message("pageMessage", error.message, true);
    } finally {
      busy = false;
    }
  }

  function action(label, fn, primary = false) {
    const button = el(
      "button",
      label,
      primary ? "sales-primary" : "sales-secondary",
    );

    button.type = "button";
    button.addEventListener("click", fn);

    $("leadActions").append(button);
  }

  function paintDetails(data) {
    selected = data.lead;

    const lead = selected;

    message("detailMessage");

    $("detailTitle").textContent = lead.name;
    $("lossForm").hidden = true;
    $("convertForm").hidden = true;
    $("noteForm").reset();
    $("interactionForm").reset();
    $("taskForm").reset();
    $("assignSelect").value = lead.assigned_to ?? "";

    const dl = el("dl", "", "sales-details");

    const fields = [
      ["Etapa", stages[lead.status]],
      ["Origem", sources[lead.source]],
      ["Telefone", lead.phone || "Não informado"],
      ["E-mail", lead.email || "Não informado"],
      ["Cidade", lead.city || "Não informada"],
      ["Veículo de interesse", lead.vehicle_label || "Não definido"],
      [
        "Vendedor responsável",
        lead.assigned_to != null
          ? usersById[lead.assigned_to] || `#${lead.assigned_to}`
          : "Não atribuído",
      ],
      [
        "Orçamento",
        lead.budget === null ? "Não informado" : money(lead.budget),
      ],
      [
        "Próximo retorno",
        date(lead.next_contact_date) + (lead.overdue ? " — vencido" : ""),
      ],
      ["Observações", lead.notes || "Sem observações"],
    ];

    if (lead.payment_method) {
      fields.push(["Forma de pagamento", paymentLabels[lead.payment_method]]);
    }

    if (lead.down_payment != null) {
      fields.push(["Valor de entrada", money(lead.down_payment)]);
    }

    if (lead.desired_installment != null) {
      fields.push(["Parcela desejada", money(lead.desired_installment)]);
    }

    if (lead.has_trade_in != null) {
      fields.push([
        "Veículo na troca",
        triLabels[lead.has_trade_in] +
          (lead.has_trade_in && lead.trade_in_estimated_value != null
            ? ` (estimado em ${money(lead.trade_in_estimated_value)})`
            : ""),
      ]);
    }

    if (lead.financing_pre_approved != null) {
      fields.push([
        "Financiamento pré-aprovado",
        `${triLabels[lead.financing_pre_approved]} (conforme informado pelo cliente, não verificado)`,
      ]);
    }

    if (lead.purchase_timeframe) {
      fields.push([
        "Prazo estimado de compra",
        timeframeLabels[lead.purchase_timeframe],
      ]);
    }

    const prefs = lead.declared_preferences || {};

    for (const [key, label] of Object.entries(preferenceLabels)) {
      if (prefs[key]) fields.push([label, prefs[key]]);
    }

    if (lead.loss_reason) {
      fields.push(["Motivo da perda", lead.loss_reason]);
    }

    fields.forEach(([label, value]) => {
      const item = el("div", "");

      item.append(el("dt", label), el("dd", value));
      dl.append(item);
    });

    $("leadDetails").replaceChildren(dl);

    paintScore(data.score, lead);
    paintTasks(data.tasks || []);

    $("leadActions").replaceChildren();

    if (lead.ai_last_error) {
      message(
        "leadAiError",
        `Última tentativa de análise falhou (${new Date(
          lead.ai_last_error.at,
        ).toLocaleString("pt-BR")}): ${lead.ai_last_error.message}`,
        true,
      );
    } else {
      message("leadAiError");
    }

    const ai = $("leadAiContent");

    ai.replaceChildren();

    if (lead.ai_score !== null && lead.ai_score !== undefined) {
      ai.append(
        el(
          "strong",
          `Prioridade estimada pela IA: ${lead.ai_score}/100 • intenção ${lead.ai_intent} • urgência ${lead.ai_urgency}`,
        ),
      );

      for (const [label, value] of [
        ["Resumo", lead.ai_summary],
        [
          "Por que essa pontuação (estimativa da IA)",
          lead.ai_score_justification,
        ],
        ["Objeção provável", lead.ai_probable_objection],
        [
          "Probabilidade de avanço",
          `${
            triProbabilityLabels[lead.ai_advance_probability] ||
            lead.ai_advance_probability
          } — estimativa, não é garantia`,
        ],
        ["Próximo passo sugerido", lead.ai_next_action],
        ["Mensagem sugerida para o cliente", lead.ai_response_draft],
      ]) {
        const box = el("div", "", "lead-ai-result");

        box.append(el("small", label), el("p", value));
        ai.append(box);
      }

      const taskFromAi = el(
        "button",
        "Criar tarefa a partir desta sugestão",
        "sales-secondary",
      );

      taskFromAi.type = "button";
      taskFromAi.addEventListener("click", createTaskFromAiSuggestion);

      ai.append(taskFromAi);
    } else {
      ai.append(el("p", "Este lead ainda não foi analisado."));
    }

    paintAiHistory(data.analyses || []);

    action(
      lead.ai_score == null ? "Analisar com IA" : "Analisar novamente",
      analyzeCurrentLead,
    );

    if (["new", "contacting", "qualified"].includes(lead.status)) {
      action("Editar dados / retorno", () => form(selected));

      if (lead.status === "new") {
        action("Iniciar atendimento", () => changeStage("contacting"), true);
      }

      if (lead.status !== "qualified") {
        action("Qualificar lead", () => changeStage("qualified"), true);
      } else {
        action("Converter em cliente", prepareConversion, true);
        action("Retomar atendimento", () => changeStage("contacting"));
      }

      action("Marcar como perdido", () => {
        if (busy) return;

        $("convertForm").hidden = true;
        $("lossForm").hidden = false;
        $("lossReason").value = "";
        $("lossReason").focus();
      });
    } else if (lead.status === "lost") {
      action("Reabrir lead", () => changeStage("new"), true);
    } else {
      const customerLink = el(
        "a",
        `Abrir cliente #${lead.customer_id}`,
        "sales-primary",
      );

      customerLink.href = `./customers.html?customer=${lead.customer_id}`;

      $("leadActions").append(customerLink);
    }

    $("eventList").replaceChildren();

    data.events.forEach((event) => {
      const item = el("article", "", "customer-history-item");

      item.append(
        el("small", new Date(event.created_at).toLocaleString("pt-BR")),
        el("p", event.content),
      );

      $("eventList").append(item);
    });

    if (!$("detailDialog").open) {
      $("detailDialog").showModal();
    }
  }

  function paintScore(score, lead) {
    const box = $("leadScoreContent");

    box.replaceChildren();
    box.append(el("p", lead.basic_summary || "", "lead-basic-summary"));

    if (!score) {
      box.append(el("p", "Ainda não avaliado. Clique em Atualizar pontuação."));
      return;
    }

    const temp = temperatureInfo[temperatureOf(score.score)];

    const badge = el(
      "strong",
      `${temp.label} • ${score.score}/100`,
      `lead-score-badge ${temp.cls}`,
    );

    box.append(badge);

    if (!score.reasons.length) {
      box.append(
        el(
          "p",
          "Nenhum critério de pontuação foi atendido ainda.",
          "sales-footnote",
        ),
      );
    } else {
      const ul = el("ul", "", "lead-score-reasons");

      score.reasons.forEach((reason) => {
        ul.append(el("li", `+${reason.points} ${reason.label}`));
      });

      box.append(ul);
    }
  }

  function paintTasks(tasks) {
    const box = $("taskList");

    box.replaceChildren();

    if (!tasks.length) {
      box.append(el("p", "Nenhuma tarefa registrada.", "sales-footnote"));
      return;
    }

    tasks.forEach((task) => {
      const item = el("article", "", `lead-task-item lead-task-${task.status}`);

      const head = el("div", "", "lead-task-head");

      head.append(
        el(
          "span",
          `${task.title}${task.due_date ? ` • até ${date(task.due_date)}` : ""}`,
        ),
      );

      if (task.status === "open") {
        const doneBtn = el("button", "Concluir", "sales-secondary");

        doneBtn.type = "button";
        doneBtn.addEventListener("click", () => setTaskStatus(task.id, "done"));

        const cancelBtn = el("button", "Cancelar", "sales-secondary");

        cancelBtn.type = "button";
        cancelBtn.addEventListener("click", () =>
          setTaskStatus(task.id, "cancelled"),
        );

        head.append(doneBtn, cancelBtn);
      } else {
        head.append(
          el("small", task.status === "done" ? "Concluída" : "Cancelada"),
        );
      }

      item.append(head);
      box.append(item);
    });
  }

  async function setTaskStatus(taskId, status) {
    if (busy) return;

    busy = true;
    message("detailMessage");

    try {
      await send(`/leads/${selected.id}/tasks/${taskId}`, "PATCH", {
        status,
      });

      await reloadAfterChange(
        status === "done" ? "Tarefa concluída." : "Tarefa cancelada.",
      );
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
    }
  }

  async function recalculateCurrentScore() {
    if (busy) return;

    busy = true;
    message("detailMessage");

    try {
      await send(`/leads/${selected.id}/score/recalculate`, "POST", {});
      await reloadAfterChange("Pontuação atualizada.");
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
    }
  }

  function paintAiHistory(analyses) {
    const box = $("aiHistoryList");

    box.replaceChildren();

    if (!analyses.length) {
      box.append(el("p", "Nenhuma análise anterior.", "sales-footnote"));
      return;
    }

    analyses.forEach((analysis) => {
      const item = el("article", "", "customer-history-item");
      const when = new Date(analysis.created_at).toLocaleString("pt-BR");

      item.append(
        el(
          "small",
          `${when} • ${analysisStatusLabels[analysis.status]} • ${
            analysis.model
          }`,
        ),
      );

      item.append(
        el(
          "p",
          analysis.status === "ok"
            ? `Prioridade ${analysis.score}/100 — ${analysis.summary}`
            : `Erro: ${analysis.error_message}`,
        ),
      );

      box.append(item);
    });
  }

  async function createTaskFromAiSuggestion() {
    if (busy || !selected?.ai_next_action) return;

    busy = true;
    message("detailMessage");

    try {
      await send(`/leads/${selected.id}/tasks`, "POST", {
        title: selected.ai_next_action.slice(0, 255),
      });

      await reloadAfterChange("Tarefa criada a partir da sugestão da IA.");
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
    }
  }

  async function analyzeCurrentLead() {
    if (busy) return;

    busy = true;
    message("detailMessage");

    try {
      await send(`/leads/${selected.id}/analyze`, "POST", {});
      paintDetails(await api(`/leads/${selected.id}`));

      message(
        "detailMessage",
        "Análise concluída. Revise as sugestões antes de agir.",
      );
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
    }
  }

  async function details(id) {
    if (busy) return;

    busy = true;
    message("pageMessage");

    try {
      paintDetails(await api(`/leads/${id}`));
    } catch (error) {
      message("pageMessage", error.message, true);
    } finally {
      busy = false;
    }
  }

  async function changeStage(status, reason = null) {
    if (busy) return;

    if (
      status !== "lost" &&
      !confirm(`Alterar etapa para ${stages[status]}?`)
    ) {
      return;
    }

    busy = true;
    message("detailMessage");

    try {
      await send(`/leads/${selected.id}/status`, "PATCH", {
        status,
        reason,
        version: selected.version,
      });

      await reloadAfterChange("Etapa atualizada.");
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
    }
  }

  async function reloadAfterChange(text) {
    try {
      paintDetails(await api(`/leads/${selected.id}`));
      await refresh();
      message("detailMessage", text);
    } catch {
      $("detailDialog").close();

      message(
        "pageMessage",
        `${text} Clique em Atualizar e reabra a ficha para carregar os dados.`,
        true,
      );
    }
  }

  function updateLeadsCommandInsights() {
    const activeLeads = leads.filter((lead) =>
      ["new", "contacting", "qualified"].includes(lead.status),
    );

    const contactedLeads = leads.filter((lead) =>
      ["contacting", "qualified", "converted", "lost"].includes(lead.status),
    );

    const responseRate = leads.length
      ? Math.round((contactedLeads.length / leads.length) * 100)
      : 0;

    const hottestLead = [...activeLeads].sort(
      (a, b) => Number(b.priority_score || 0) - Number(a.priority_score || 0),
    )[0];

    const lateLead = [...activeLeads]
      .filter((lead) => lead.overdue)
      .sort((a, b) =>
        String(a.next_contact_date || "").localeCompare(
          String(b.next_contact_date || ""),
        ),
      )[0];

    const sourceRanking = Object.entries(
      leads.reduce((acc, lead) => {
        const source = lead.source || "other";
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);

    putOptional("responseRateCount", `${responseRate}%`);

    putOptional(
      "hotLeadName",
      hottestLead ? hottestLead.name : "Nenhum lead ativo",
    );

    putOptional(
      "lateLeadName",
      lateLead ? lateLead.name : "Sem retorno atrasado",
    );

    putOptional(
      "bestLeadSource",
      sourceRanking[0] ? sources[sourceRanking[0][0]] || "Outra" : "Sem dados",
    );

    const title = $("leadRecommendationTitle");
    const text = $("leadRecommendationText");
    const button = $("leadRecommendationButton");

    if (!title || !text || !button) return;

    if (lateLead) {
      title.textContent = `Retome ${lateLead.name} agora`;
      text.textContent = `${
        lateLead.vehicle_label || "Lead sem veículo definido"
      } está com retorno vencido. Priorize antes que a oportunidade esfrie.`;
      button.disabled = false;
      button.onclick = () => details(lateLead.id);
      return;
    }

    if (hottestLead) {
      const temp = temperatureInfo[temperatureOf(hottestLead.priority_score)];

      title.textContent = `Atenda ${hottestLead.name} primeiro`;
      text.textContent = `${
        hottestLead.vehicle_label || "Lead sem veículo definido"
      } • ${temp ? temp.label.toLowerCase() : "prioridade em análise"} • ${
        hottestLead.priority_score ?? 0
      }/100.`;
      button.disabled = false;
      button.onclick = () => details(hottestLead.id);
      return;
    }

    title.textContent = "Nenhuma ação urgente agora";
    text.textContent =
      "Cadastre ou atualize leads para a IA sugerir a próxima melhor ação.";
    button.disabled = true;
  }

  function putOptional(id, value) {
    const node = $(id);

    if (node) {
      node.textContent = value;
    }
  }

  async function prepareConversion() {
    if (busy) return;

    busy = true;
    message("detailMessage");

    try {
      $("customerSelect").replaceChildren(
        new Option("Criar novo cliente com os dados do lead", ""),
      );

      try {
        const data = await api("/customers?active=true");

        data.customers.forEach((customer) => {
          $("customerSelect").add(
            new Option(
              `${customer.name} • ${
                customer.phone || customer.email || "#" + customer.id
              }`,
              customer.id,
            ),
          );
        });
      } catch {}

      $("lossForm").hidden = true;
      $("convertForm").hidden = false;
      $("customerSelect").focus();
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
    }
  }

  $("leadForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (busy) return;

    busy = true;
    $("saveLead").disabled = true;
    message("formMessage");

    try {
      const body = Object.fromEntries(new FormData(event.target));
      const declaredPreferences = {};

      for (const key of Object.keys(body)) {
        if (key.startsWith("pref_")) {
          const value = body[key];

          delete body[key];

          if (value) {
            declaredPreferences[key.slice(5)] = value;
          }
        }
      }

      body.declared_preferences = declaredPreferences;

      if (editing) {
        body.version = editing.version;
      }

      await send(
        editing ? `/leads/${editing.id}` : "/leads",
        editing ? "PUT" : "POST",
        body,
      );

      $("leadDialog").close();
      message("pageMessage", "Lead salvo.");

      try {
        await refresh();
      } catch {
        message(
          "pageMessage",
          "Lead salvo. Clique em Atualizar para recarregar.",
          true,
        );
      }
    } catch (error) {
      message("formMessage", error.message, true);
    } finally {
      busy = false;
      $("saveLead").disabled = false;
    }
  });

  $("lossForm").addEventListener("submit", (event) => {
    event.preventDefault();

    changeStage("lost", $("lossReason").value);
  });

  $("noteForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (busy) return;

    busy = true;
    $("saveNote").disabled = true;
    message("detailMessage");

    try {
      await send(`/leads/${selected.id}/notes`, "POST", {
        version: selected.version,
        content: $("noteContent").value,
      });

      await reloadAfterChange("Atendimento registrado.");
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
      $("saveNote").disabled = false;
    }
  });

  $("interactionForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (busy) return;

    busy = true;
    $("saveInteraction").disabled = true;
    message("detailMessage");

    try {
      await send(`/leads/${selected.id}/interactions`, "POST", {
        version: selected.version,
        type: $("interactionType").value,
        note: $("interactionNote").value,
      });

      await reloadAfterChange("Interação registrada.");
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
      $("saveInteraction").disabled = false;
    }
  });

  $("taskForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (busy) return;

    busy = true;
    message("detailMessage");

    try {
      await send(`/leads/${selected.id}/tasks`, "POST", {
        title: $("taskTitle").value,
        due_date: $("taskDueDate").value || undefined,
      });

      await reloadAfterChange("Tarefa adicionada.");
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
    }
  });

  $("recalcScoreBtn").addEventListener("click", recalculateCurrentScore);

  $("assignForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (busy) return;

    busy = true;
    message("detailMessage");

    try {
      await send(`/leads/${selected.id}/assign`, "PATCH", {
        version: selected.version,
        assigned_to: $("assignSelect").value || null,
      });

      await reloadAfterChange("Atribuição atualizada.");
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
    }
  });

  $("convertForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (busy) return;

    if (
      !confirm(
        "Confirmar a conversão e vincular este lead ao cadastro selecionado?",
      )
    ) {
      return;
    }

    busy = true;
    message("detailMessage");

    try {
      const result = await send(`/leads/${selected.id}/convert`, "POST", {
        version: selected.version,
        customer_id: $("customerSelect").value,
      });

      await reloadAfterChange(
        `Lead convertido no cliente #${result.customer_id}.`,
      );
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
    }
  });

  $("newLead").addEventListener("click", () => form());

  $("leadsBoard").addEventListener("click", (event) => {
    if (event.target.closest("[data-add-status]")) {
      form();
    }
  });

  for (const id of [
    "search",
    "statusFilter",
    "sourceFilter",
    "returnFilter",
    "assigneeFilter",
  ]) {
    $(id).addEventListener(id === "search" ? "input" : "change", render);
  }

  $("filters").addEventListener("submit", async (event) => {
    event.preventDefault();

    message("pageMessage");

    try {
      const meta = await api("/integrations/meta/status");

      $("metaStatus").textContent = meta.configured
        ? `Credenciais configuradas • Graph API ${meta.graphVersion}`
        : "Aguardando credenciais e webhook da Meta.";

      await refresh();
    } catch (error) {
      message("pageMessage", error.message, true);
    }
  });

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!busy) {
        $(button.dataset.close).close();
      }
    });
  });

  for (const id of ["leadDialog", "detailDialog"]) {
    $(id).addEventListener("cancel", (event) => {
      if (busy) {
        event.preventDefault();
      }
    });
  }

  requireAuth().then(async (user) => {
    if (!user) return;

    if (!["admin", "vendedor"].includes(user.role)) {
      message(
        "pageMessage",
        "A área de leads está disponível apenas para administradores e vendedores.",
        true,
      );

      return;
    }

    $("newLead").disabled = false;

    await loadUsers();

    try {
      await refresh();

      const id = new URLSearchParams(location.search).get("lead");

      if (id) {
        await details(id);
      }
    } catch (error) {
      message("pageMessage", error.message, true);
    }
  });
})();
