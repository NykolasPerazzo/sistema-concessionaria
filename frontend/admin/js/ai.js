(() => {
  "use strict";

  try {
    document.body.classList.toggle(
      "light-theme",
      localStorage.getItem("carDealerAdminTheme") === "light",
    );
  } catch {}

  const $ = (id) => document.getElementById(id);

  const ACTIVE_KEY = "carDealerAiActiveConversation";
  const HISTORY_KEY = "carDealerAiHistory";
  const MAX_HISTORY = 30;
  const MAX_HISTORY_PREVIEW = 3;
  const MAX_QUESTION_LENGTH = 2000;

  const AUTOMATION_KEYS = {
    autoDailySummary: "ai_automation_daily_summary",
    autoStaleLead: "ai_automation_stale_lead_alert",
    autoMarginWatch: "ai_automation_margin_watch",
  };

  let activeMessages = [];
  let history = [];
  let submitting = false;

  /* ==========================================
     ARMAZENAMENTO DE SESSÃO
     Não existe persistência de conversas no backend ainda: o histórico
     abaixo vive só em sessionStorage (aba atual). Preparado para trocar
     por uma API real quando ela existir.
  ========================================== */

  function loadSession() {
    try {
      activeMessages = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "[]");
    } catch {
      activeMessages = [];
    }

    try {
      history = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
    } catch {
      history = [];
    }
  }

  function persistActive() {
    try {
      sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(activeMessages));
    } catch {}
  }

  function persistHistory() {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {}
  }

  /* ==========================================
     HTTP
  ========================================== */

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      ...options,
    });

    if (response.status === 401) {
      window.location.href = "./login.html";
      throw new Error("Sua sessão expirou.");
    }

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : {};

    if (!response.ok) {
      throw new Error(
        data.error || "Não foi possível concluir a operação.",
      );
    }

    return data;
  }

  /* ==========================================
     MENSAGENS DE PÁGINA
  ========================================== */

  function pageMessage(text = "", isError = false) {
    const el = $("aiPageMessage");

    if (!el) return;

    el.textContent = text;
    el.hidden = !text;
    el.className = `ai-page-message ${isError ? "error" : "success"}`;
  }

  function showChatError(text = "") {
    const el = $("aiChatError");

    if (!el) return;

    el.textContent = text;
    el.hidden = !text;
  }

  function truncate(text, max) {
    const clean = String(text || "").trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
  }

  function formatTime(iso) {
    if (!iso) return "";

    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /* ==========================================
     STATUS DA IA
  ========================================== */

  async function checkAiStatus() {
    const status = $("aiStatus");
    const text = $("aiStatusText");

    try {
      const data = await apiFetch("/ai/status");

      status.dataset.state = data.available ? "online" : "offline";
      text.textContent = data.available ? "IA online" : "IA indisponível";
    } catch {
      status.dataset.state = "offline";
      text.textContent = "IA indisponível";
    }
  }

  /* ==========================================
     VISÃO DA OPERAÇÃO
  ========================================== */

  function setMetric(rowId, valueId, text, state = "") {
    const row = $(rowId);
    const value = $(valueId);

    if (row) row.dataset.state = state;
    if (value) value.textContent = text;
  }

  function applyStockMetric(result) {
    if (result.status !== "fulfilled") {
      setMetric("aiMetricStock", "aiMetricStockValue", "—");
      return;
    }

    const vehicles = result.value.vehicles || [];
    const available = vehicles.filter((v) => v.status !== "sold").length;

    setMetric(
      "aiMetricStock",
      "aiMetricStockValue",
      `${available} veículo(s)`,
      available > 0 ? "healthy" : "critical",
    );
  }

  function applyLeadsMetric(result) {
    if (result.status !== "fulfilled") {
      setMetric("aiMetricLeads", "aiMetricLeadsValue", "—");
      return;
    }

    const leads = result.value.leads || [];
    const waiting = leads.filter((lead) => lead.status === "new").length;

    let state = "healthy";

    if (waiting > 5) state = "critical";
    else if (waiting > 0) state = "warning";

    setMetric(
      "aiMetricLeads",
      "aiMetricLeadsValue",
      `${waiting} aguardando`,
      state,
    );
  }

  function applySalesMetrics(salesResult, settingsResult) {
    if (salesResult.status !== "fulfilled") {
      setMetric("aiMetricSales", "aiMetricSalesValue", "—");
      setMetric("aiMetricMargin", "aiMetricMarginValue", "—");
      return;
    }

    const now = new Date();

    const monthSales = (salesResult.value.sales || []).filter((sale) => {
      const date = new Date(`${sale.sale_date}T00:00:00`);

      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      );
    });

    const revenue = monthSales.reduce(
      (sum, sale) => sum + Number(sale.sale_price),
      0,
    );

    const profit = monthSales.reduce(
      (sum, sale) => sum + Number(sale.profit),
      0,
    );

    const margin = revenue ? (profit / revenue) * 100 : 0;

    let goal = null;

    if (settingsResult.status === "fulfilled") {
      const rawGoal = settingsResult.value.settings?.monthly_goal;

      goal = Number(rawGoal) > 0 ? Number(rawGoal) : null;
    }

    let salesState = "";

    if (goal) {
      salesState =
        monthSales.length >= goal
          ? "healthy"
          : monthSales.length >= goal * 0.5
            ? "warning"
            : "critical";
    }

    setMetric(
      "aiMetricSales",
      "aiMetricSalesValue",
      `${monthSales.length} venda(s)`,
      salesState,
    );

    let marginState = "";

    if (monthSales.length) {
      if (margin < 5) marginState = "critical";
      else if (margin < 12) marginState = "warning";
      else marginState = "healthy";
    }

    setMetric(
      "aiMetricMargin",
      "aiMetricMarginValue",
      monthSales.length ? `${margin.toFixed(1).replace(".", ",")}%` : "—",
      marginState,
    );
  }

  async function loadOperationView() {
    const [vehiclesResult, leadsResult, salesResult, settingsResult] =
      await Promise.allSettled([
        apiFetch("/vehicles"),
        apiFetch("/leads"),
        apiFetch("/sales?status=active"),
        apiFetch("/settings"),
      ]);

    applyStockMetric(vehiclesResult);
    applyLeadsMetric(leadsResult);
    applySalesMetrics(salesResult, settingsResult);
    applyAutomationSettings(settingsResult);
  }

  /* ==========================================
     AUTOMAÇÕES
     Reaproveita a rota genérica de configurações (GET/PUT /api/settings).
     Sem um motor de automação real por trás ainda: o toggle só guarda a
     preferência do admin, pronta para um futuro worker consumir.
  ========================================== */

  function applyAutomationSettings(settingsResult) {
    const hint = $("aiAutomationHint");

    if (settingsResult.status !== "fulfilled") {
      hint.textContent = "Configuração ainda não disponível.";
      hint.hidden = false;
      return;
    }

    const settings = settingsResult.value.settings || {};

    Object.entries(AUTOMATION_KEYS).forEach(([id, key]) => {
      const input = $(id);

      if (!input) return;

      input.checked = settings[key] === true;
      input.disabled = false;
    });

    hint.hidden = true;
  }

  function bindAutomationToggles() {
    Object.entries(AUTOMATION_KEYS).forEach(([id, key]) => {
      const input = $(id);

      if (!input) return;

      input.addEventListener("change", async () => {
        const checked = input.checked;

        input.disabled = true;

        try {
          await apiFetch("/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [key]: checked }),
          });

          pageMessage(
            `Automação ${checked ? "ativada" : "desativada"}.`,
            false,
          );
        } catch (error) {
          input.checked = !checked;
          pageMessage(error.message, true);
        } finally {
          input.disabled = false;
        }
      });
    });
  }

  /* ==========================================
     CONVERSA
  ========================================== */

  function buildAvatar(role) {
    const avatar = document.createElement("div");

    avatar.className = "ai-msg-avatar";

    const icon = document.createElement("i");

    icon.className =
      role === "user" ? "fa-solid fa-user" : "fa-solid fa-wand-magic-sparkles";

    avatar.append(icon);

    return avatar;
  }

  function buildQuickActions() {
    const nav = document.createElement("div");

    nav.className = "ai-msg-actions";

    [
      ["Ver veículos", "./vehicles.html"],
      ["Ver leads", "./leads.html"],
      ["Abrir vendas", "./sales.html"],
    ].forEach(([label, href]) => {
      const link = document.createElement("a");

      link.href = href;
      link.textContent = label;

      nav.append(link);
    });

    return nav;
  }

  function buildMessageNode(msg) {
    const wrap = document.createElement("div");

    wrap.className = `ai-msg ${msg.role}${msg.loading ? " loading" : ""}${
      msg.error ? " error" : ""
    }`;

    wrap.append(buildAvatar(msg.role));

    const body = document.createElement("div");

    body.className = "ai-msg-body";

    const bubble = document.createElement("div");

    bubble.className = "ai-msg-bubble";
    bubble.textContent = msg.text;

    body.append(bubble);

    if (msg.at) {
      const time = document.createElement("small");

      time.className = "ai-msg-time";
      time.textContent = formatTime(msg.at);

      body.append(time);
    }

    if (msg.role === "assistant" && !msg.loading && !msg.error) {
      body.append(buildQuickActions());
    }

    wrap.append(body);

    return wrap;
  }

  function scrollChatToBottom() {
    const container = $("aiMessages");

    container.scrollTop = container.scrollHeight;
  }

  function renderActiveConversation() {
    const empty = $("aiEmptyState");
    const list = $("aiMessageList");

    list.replaceChildren();

    if (!activeMessages.length) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    activeMessages.forEach((msg) => list.append(buildMessageNode(msg)));

    scrollChatToBottom();
  }

  function autoResizeInput() {
    const input = $("aiInput");

    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  }

  async function sendQuestion(rawText) {
    const text = String(rawText || "").trim();

    if (!text || submitting) return;

    if (text.length > MAX_QUESTION_LENGTH) {
      showChatError(
        `A pergunta deve ter no máximo ${MAX_QUESTION_LENGTH} caracteres.`,
      );
      return;
    }

    submitting = true;
    showChatError("");
    $("aiSend").disabled = true;
    $("aiInput").disabled = true;

    activeMessages.push({
      role: "user",
      text,
      at: new Date().toISOString(),
    });

    persistActive();
    renderActiveConversation();

    activeMessages.push({
      role: "assistant",
      text: "Analisando...",
      loading: true,
    });

    renderActiveConversation();

    try {
      const data = await apiFetch("/ai/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });

      activeMessages.pop();

      activeMessages.push({
        role: "assistant",
        text: data.answer,
        at: new Date().toISOString(),
      });
    } catch (error) {
      activeMessages.pop();

      activeMessages.push({
        role: "assistant",
        text: error.message,
        at: new Date().toISOString(),
        error: true,
      });

      showChatError(error.message);
    } finally {
      persistActive();
      renderActiveConversation();

      submitting = false;
      $("aiSend").disabled = false;
      $("aiInput").disabled = false;
      $("aiInput").focus();
    }
  }

  /* ==========================================
     HISTÓRICO (sessão atual)
  ========================================== */

  function finalizeConversation() {
    const firstUser = activeMessages.find((msg) => msg.role === "user");

    if (!firstUser) return;

    const lastAssistant = [...activeMessages]
      .reverse()
      .find((msg) => msg.role === "assistant" && !msg.loading && !msg.error);

    history.unshift({
      id: `${Date.now()}`,
      title: truncate(firstUser.text, 48),
      summary: lastAssistant
        ? truncate(lastAssistant.text, 90)
        : "Aguardando resposta.",
      at: new Date().toISOString(),
      messages: activeMessages.filter((msg) => !msg.loading),
    });

    history = history.slice(0, MAX_HISTORY);
    persistHistory();
  }

  function buildHistoryItem(entry) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "ai-history-item";

    const title = document.createElement("strong");

    title.textContent = entry.title;

    const summary = document.createElement("span");

    summary.textContent = entry.summary;

    const time = document.createElement("time");

    time.textContent = formatTime(entry.at);

    button.append(title, summary, time);

    button.addEventListener("click", () => openConversation(entry));

    return button;
  }

  function renderHistory() {
    const list = $("aiHistoryList");

    list.replaceChildren();

    if (!history.length) {
      const empty = document.createElement("p");

      empty.className = "ai-history-empty";
      empty.textContent = "Nenhuma conversa nesta sessão ainda.";

      list.append(empty);
      $("aiSeeAll").hidden = true;

      return;
    }

    history
      .slice(0, MAX_HISTORY_PREVIEW)
      .forEach((entry) => list.append(buildHistoryItem(entry)));

    $("aiSeeAll").hidden = history.length <= MAX_HISTORY_PREVIEW;
  }

  function openConversation(entry) {
    $("aiConversationDialogTitle").textContent = entry.title;

    const container = $("aiConversationDialogMessages");

    container.replaceChildren();

    entry.messages.forEach((msg) => container.append(buildMessageNode(msg)));

    if ($("aiHistoryDialog").open) {
      $("aiHistoryDialog").close();
    }

    $("aiConversationDialog").showModal();
  }

  function startNewConversation() {
    finalizeConversation();

    activeMessages = [];

    persistActive();
    renderActiveConversation();
    renderHistory();
    showChatError("");
  }

  /* ==========================================
     EVENTOS
  ========================================== */

  function bindEvents() {
    $("aiNewChat").addEventListener("click", startNewConversation);

    $("aiQuickQuestions").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-question]");

      if (button) sendQuestion(button.dataset.question);
    });

    $("aiForm").addEventListener("submit", (event) => {
      event.preventDefault();

      const value = $("aiInput").value;

      $("aiInput").value = "";
      autoResizeInput();

      sendQuestion(value);
    });

    $("aiInput").addEventListener("input", autoResizeInput);

    $("aiInput").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        $("aiForm").requestSubmit();
      }
    });

    $("aiSeeAll").addEventListener("click", () => {
      const list = $("aiHistoryDialogList");

      list.replaceChildren();

      history.forEach((entry) => list.append(buildHistoryItem(entry)));

      $("aiHistoryDialog").showModal();
    });

    $("aiHistoryDialogClose").addEventListener("click", () => {
      $("aiHistoryDialog").close();
    });

    $("aiConversationDialogClose").addEventListener("click", () => {
      $("aiConversationDialog").close();
    });

    for (const id of ["aiHistoryDialog", "aiConversationDialog"]) {
      $(id).addEventListener("click", (event) => {
        if (event.target === $(id)) $(id).close();
      });
    }

    bindAutomationToggles();
  }

  /* ==========================================
     INÍCIO
  ========================================== */

  async function start() {
    loadSession();
    renderActiveConversation();
    renderHistory();
    bindEvents();

    const user = await requireAuth();

    if (!user) return;

    checkAiStatus();
    loadOperationView().catch((error) => {
      console.error("Erro ao carregar visão da operação:", error);
    });
  }

  start().catch((error) => {
    console.error("Erro ao iniciar o assistente de IA:", error);

    pageMessage(
      "Não foi possível iniciar o assistente. Atualize a página e tente novamente.",
      true,
    );
  });
})();
