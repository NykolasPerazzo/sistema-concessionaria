(() => {
  try {
    document.body.classList.toggle(
      "light-theme",
      localStorage.getItem("carDealerAdminTheme") === "light",
    );
  } catch {}
  const $ = (id) => document.getElementById(id),
    money = (n) =>
      Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
  const paymentLabels = { cash: "À vista", financing: "Financiado" };
  const timeframeLabels = {
    immediate: "Compra imediata",
    "7_days": "Em até 7 dias",
    "30_days": "Em até 30 dias",
    "90_days": "Em até 90 dias",
    research_only: "Ainda só pesquisando",
  };
  const triLabels = { true: "Sim", false: "Não" };
  const temperatureInfo = {
    hot: { label: "Quente", cls: "lead-hot" },
    warm: { label: "Morno", cls: "lead-warm" },
    cold: { label: "Frio", cls: "lead-cold" },
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
  function temperatureOf(score) {
    if (score == null) return null;
    if (score >= 70) return "hot";
    if (score >= 40) return "warm";
    return "cold";
  }
  const date = (s) =>
    s ? s.slice(0, 10).split("-").reverse().join("/") : "Não definido";
  let leads = [],
    editing = null,
    selected = null,
    busy = false,
    requestVersion = 0;
  function el(tag, text, cls) {
    const n = document.createElement(tag);
    n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function message(id, text = "", error = false) {
    $(id).textContent = text;
    $(id).hidden = !text;
    $(id).className = `sales-message ${error ? "error" : "success"}`;
  }
  async function api(path, options = {}) {
    const r = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      ...options,
    });
    if (r.status === 401) {
      location.href = "./login.html";
      throw new Error("Sua sessão expirou.");
    }
    const data = await r.json();
    if (!r.ok)
      throw new Error(data.error || "Não foi possível carregar os leads.");
    return data;
  }
  const send = (path, method, body) =>
    api(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  function render() {
    const newLeadsCount = leads.filter((l) => l.status === "new").length;
    $("newCount").textContent = newLeadsCount;
    document.dispatchEvent(
      new CustomEvent("leads:new-count", { detail: newLeadsCount }),
    );
    $("activeCount").textContent = leads.filter((l) =>
      ["contacting", "qualified"].includes(l.status),
    ).length;
    $("overdueCount").textContent = leads.filter((l) => l.overdue).length;
    const q = $("search").value.trim().toLocaleLowerCase("pt-BR"),
      digits = q.replace(/\D/g, ""),
      status = $("statusFilter").value,
      source = $("sourceFilter").value;
    const rows = leads.filter(
      (l) =>
        (status === "all" || l.status === status) &&
        (source === "all" || source === l.source) &&
        ($("returnFilter").value === "all" || l.overdue) &&
        (`${l.name} ${l.phone || ""} ${l.email || ""} ${l.vehicle_label || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(q) ||
          (digits.length >= 3 &&
            (l.phone || "").replace(/\D/g, "").includes(digits))),
    );
    $("recordCount").textContent = `${rows.length} lead(s)`;
    $("leadRows").replaceChildren();
    if (!rows.length) {
      const row = el("tr", ""),
        td = el(
          "td",
          "Nenhum lead encontrado. Cadastre um interessado ou ajuste os filtros.",
          "sales-empty",
        );
      td.colSpan = 5;
      row.append(td);
      $("leadRows").append(row);
      return;
    }
    rows.forEach((l) => {
      const row = el("tr", ""),
        name = el("td", "");
      name.append(el("strong", l.name), el("small", l.phone || l.email));
      const temp = temperatureInfo[temperatureOf(l.priority_score)];
      if (temp)
        name.append(
          el(
            "small",
            `${temp.label} • ${l.priority_score}/100`,
            `lead-score-tag ${temp.cls}`,
          ),
        );
      const interest = el("td", "");
      interest.append(
        el("strong", l.vehicle_label || "Veículo não definido"),
        el("small", sources[l.source]),
      );
      row.append(name, interest, el("td", stages[l.status]));
      const next = el(
        "td",
        date(l.next_contact_date),
        l.overdue ? "sales-negative" : "",
      );
      if (l.overdue) next.append(el("small", "Retorno vencido"));
      row.append(next);
      const td = el("td", ""),
        b = el("button", "Atender", "sales-secondary");
      b.type = "button";
      b.addEventListener("click", () => details(l.id));
      td.append(b);
      row.append(td);
      $("leadRows").append(row);
    });
  }
  async function refresh() {
    const version = ++requestVersion;
    try {
      const data = await api("/leads");
      if (version !== requestVersion) return;
      leads = data.leads;
      render();
    } catch (error) {
      if (version !== requestVersion) return;
      leads = [];
      render();
      ["newCount", "activeCount", "overdueCount"].forEach(
        (id) => ($(id).textContent = "—"),
      );
      $("leadRows").firstChild.firstChild.textContent =
        "Falha ao carregar. Clique em Atualizar para tentar novamente.";
      throw error;
    }
  }
  async function form(l = null) {
    if (busy) return;
    busy = true;
    message("pageMessage");
    try {
      const data = await api("/vehicles");
      editing = l;
      $("leadForm").reset();
      message("formMessage");
      $("leadTitle").textContent = l ? "Editar lead" : "Novo lead";
      $("vehicleSelect").replaceChildren(new Option("Ainda não definido", ""));
      data.vehicles.forEach((v) =>
        $("vehicleSelect").add(
          new Option(
            `${v.brand} ${v.model} • ${v.year} • #${v.id}${v.status === "sold" ? " (vendido)" : ""}`,
            v.id,
          ),
        ),
      );
      if (l) {
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
        ])
          $("leadForm").elements[name].value = l[name] ?? "";
        const tri = (v) => (v === true ? "yes" : v === false ? "no" : "");
        $("leadForm").elements.has_trade_in.value = tri(l.has_trade_in);
        $("leadForm").elements.financing_pre_approved.value = tri(
          l.financing_pre_approved,
        );
        const prefs = l.declared_preferences || {};
        for (const key of Object.keys(preferenceLabels))
          $("leadForm").elements[`pref_${key}`].value = prefs[key] ?? "";
      }
      if ($("detailDialog").open) $("detailDialog").close();
      $("leadDialog").showModal();
    } catch (error) {
      message("pageMessage", error.message, true);
    } finally {
      busy = false;
    }
  }
  function action(label, fn, primary = false) {
    const b = el(
      "button",
      label,
      primary ? "sales-primary" : "sales-secondary",
    );
    b.type = "button";
    b.addEventListener("click", fn);
    $("leadActions").append(b);
  }
  function paintDetails(data) {
    selected = data.lead;
    const l = selected;
    message("detailMessage");
    $("detailTitle").textContent = l.name;
    $("lossForm").hidden = true;
    $("convertForm").hidden = true;
    $("noteForm").reset();
    $("interactionForm").reset();
    $("taskForm").reset();
    const dl = el("dl", "", "sales-details");
    const fields = [
      ["Etapa", stages[l.status]],
      ["Origem", sources[l.source]],
      ["Telefone", l.phone || "Não informado"],
      ["E-mail", l.email || "Não informado"],
      ["Cidade", l.city || "Não informada"],
      ["Veículo de interesse", l.vehicle_label || "Não definido"],
      ["Orçamento", l.budget === null ? "Não informado" : money(l.budget)],
      [
        "Próximo retorno",
        date(l.next_contact_date) + (l.overdue ? " — vencido" : ""),
      ],
      ["Observações", l.notes || "Sem observações"],
    ];
    if (l.payment_method)
      fields.push(["Forma de pagamento", paymentLabels[l.payment_method]]);
    if (l.down_payment != null)
      fields.push(["Valor de entrada", money(l.down_payment)]);
    if (l.desired_installment != null)
      fields.push(["Parcela desejada", money(l.desired_installment)]);
    if (l.has_trade_in != null)
      fields.push([
        "Veículo na troca",
        triLabels[l.has_trade_in] +
          (l.has_trade_in && l.trade_in_estimated_value != null
            ? ` (estimado em ${money(l.trade_in_estimated_value)})`
            : ""),
      ]);
    if (l.financing_pre_approved != null)
      fields.push([
        "Financiamento pré-aprovado",
        `${triLabels[l.financing_pre_approved]} (conforme informado pelo cliente, não verificado)`,
      ]);
    if (l.purchase_timeframe)
      fields.push(["Prazo estimado de compra", timeframeLabels[l.purchase_timeframe]]);
    const prefs = l.declared_preferences || {};
    for (const [key, label] of Object.entries(preferenceLabels))
      if (prefs[key]) fields.push([label, prefs[key]]);
    if (l.loss_reason) fields.push(["Motivo da perda", l.loss_reason]);
    fields.forEach(([label, value]) => {
      const d = el("div", "");
      d.append(el("dt", label), el("dd", value));
      dl.append(d);
    });
    $("leadDetails").replaceChildren(dl);
    paintScore(data.score, l);
    paintTasks(data.tasks || []);
    $("leadActions").replaceChildren();
    const ai = $("leadAiContent");
    ai.replaceChildren();
    if (l.ai_score !== null && l.ai_score !== undefined) {
      ai.append(
        el(
          "strong",
          `Prioridade ${l.ai_score}/100 • intenção ${l.ai_intent} • urgência ${l.ai_urgency}`,
        ),
      );
      for (const [label, value] of [
        ["Resumo", l.ai_summary],
        ["Próximo passo sugerido", l.ai_next_action],
        ["Rascunho de resposta", l.ai_response_draft],
      ]) {
        const box = el("div", "", "lead-ai-result");
        box.append(el("small", label), el("p", value));
        ai.append(box);
      }
    } else ai.append(el("p", "Este lead ainda não foi analisado."));
    action(
      l.ai_score == null ? "Analisar com IA" : "Analisar novamente",
      analyzeCurrentLead,
    );
    if (["new", "contacting", "qualified"].includes(l.status)) {
      action("Editar dados / retorno", () => form(selected));
      if (l.status === "new")
        action("Iniciar atendimento", () => changeStage("contacting"), true);
      if (l.status !== "qualified")
        action("Qualificar lead", () => changeStage("qualified"), true);
      else {
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
    } else if (l.status === "lost")
      action("Reabrir lead", () => changeStage("new"), true);
    else {
      const a = el("a", `Abrir cliente #${l.customer_id}`, "sales-primary");
      a.href = `./customers.html?customer=${l.customer_id}`;
      $("leadActions").append(a);
    }
    $("eventList").replaceChildren();
    data.events.forEach((e) => {
      const item = el("article", "", "customer-history-item");
      item.append(
        el("small", new Date(e.created_at).toLocaleString("pt-BR")),
        el("p", e.content),
      );
      $("eventList").append(item);
    });
    if (!$("detailDialog").open) $("detailDialog").showModal();
  }
  function paintScore(score, l) {
    const box = $("leadScoreContent");
    box.replaceChildren();
    box.append(el("p", l.basic_summary || "", "lead-basic-summary"));
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
        el("p", "Nenhum critério de pontuação foi atendido ainda.", "sales-footnote"),
      );
    } else {
      const ul = el("ul", "", "lead-score-reasons");
      score.reasons.forEach((r) => {
        ul.append(el("li", `+${r.points} ${r.label}`));
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
    tasks.forEach((t) => {
      const item = el("article", "", `lead-task-item lead-task-${t.status}`);
      const head = el("div", "", "lead-task-head");
      head.append(
        el(
          "span",
          `${t.title}${t.due_date ? ` • até ${date(t.due_date)}` : ""}`,
        ),
      );
      if (t.status === "open") {
        const doneBtn = el("button", "Concluir", "sales-secondary");
        doneBtn.type = "button";
        doneBtn.addEventListener("click", () => setTaskStatus(t.id, "done"));
        const cancelBtn = el("button", "Cancelar", "sales-secondary");
        cancelBtn.type = "button";
        cancelBtn.addEventListener("click", () =>
          setTaskStatus(t.id, "cancelled"),
        );
        head.append(doneBtn, cancelBtn);
      } else {
        head.append(
          el("small", t.status === "done" ? "Concluída" : "Cancelada"),
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
    if (status !== "lost" && !confirm(`Alterar etapa para ${stages[status]}?`))
      return;
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
  async function prepareConversion() {
    if (busy) return;
    busy = true;
    message("detailMessage");
    try {
      $("customerSelect").replaceChildren(
        new Option("Criar novo cliente com os dados do lead", ""),
      );
      /*
       * A listagem de clientes é restrita a administradores. Vendedores
       * ainda podem converter criando um cliente novo — só não veem a
       * lista de cadastros existentes para vincular.
       */
      try {
        const data = await api("/customers?active=true");
        data.customers.forEach((c) =>
          $("customerSelect").add(
            new Option(
              `${c.name} • ${c.phone || c.email || "#" + c.id}`,
              c.id,
            ),
          ),
        );
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
  $("leadForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    $("saveLead").disabled = true;
    message("formMessage");
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const declared_preferences = {};
      for (const key of Object.keys(body)) {
        if (key.startsWith("pref_")) {
          const value = body[key];
          delete body[key];
          if (value) declared_preferences[key.slice(5)] = value;
        }
      }
      body.declared_preferences = declared_preferences;
      if (editing) body.version = editing.version;
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
  $("lossForm").addEventListener("submit", (e) => {
    e.preventDefault();
    changeStage("lost", $("lossReason").value);
  });
  $("noteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
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
  $("interactionForm").addEventListener("submit", async (e) => {
    e.preventDefault();
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
  $("taskForm").addEventListener("submit", async (e) => {
    e.preventDefault();
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
  $("convertForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    if (
      !confirm(
        "Confirmar a conversão e vincular este lead ao cadastro selecionado?",
      )
    )
      return;
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
  for (const id of ["search", "statusFilter", "sourceFilter", "returnFilter"])
    $(id).addEventListener(id === "search" ? "input" : "change", render);
  $("filters").addEventListener("submit", async (e) => {
    e.preventDefault();
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
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => {
      if (!busy) $(b.dataset.close).close();
    }),
  );
  for (const id of ["leadDialog", "detailDialog"])
    $(id).addEventListener("cancel", (e) => {
      if (busy) e.preventDefault();
    });
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
    try {
      await refresh();
      const id = new URLSearchParams(location.search).get("lead");
      if (id) await details(id);
    } catch (error) {
      message("pageMessage", error.message, true);
    }
  });
})();
