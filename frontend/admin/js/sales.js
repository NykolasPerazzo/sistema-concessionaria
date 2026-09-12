(() => {
  "use strict";

  try {
    document.body.classList.toggle(
      "light-theme",
      localStorage.getItem("carDealerAdminTheme") === "light",
    );
  } catch {}

  const $ = (id) => document.getElementById(id);

  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const money = (value) =>
    number(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const formatDate = (value) => {
    const raw = String(value || "").slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return "—";
    }

    const [year, month, day] = raw.split("-");
    return `${day}/${month}/${year}`;
  };

  const text = (value, fallback = "Não informado") =>
    String(value || "").trim() || fallback;

  const setText = (id, value) => {
    const element = $(id);

    if (element) {
      element.textContent = value;
    }
  };

  const paymentMethods = {
    pix: "Pix",
    transfer: "Transferência",
    cash: "Dinheiro",
    financing: "Financiamento",
    mixed: "Misto / com troca",
  };

  const SELLER_COLORS = ["#ff5a2e", "#3d8bff", "#8b6bff", "#22c55e", "#f5a623"];
  const SELLER_FALLBACK_COLOR = "#6b7280";

  let vehicles = [];
  let sellers = [];
  let sales = [];
  let selectedSale = null;
  let submitting = false;
  let requestVersion = 0;
  let salesAbortController = null;
  let currentUser = null;

  const now = new Date();

  const localToday = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  function showMessage(id, content = "", error = false) {
    const element = $(id);

    if (!element) return;

    element.textContent = content;
    element.hidden = !content;
    element.className = `sales-message ${error ? "error" : "success"}`;
  }

  async function readResponse(response) {
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      if (!response.ok) {
        throw new Error("O servidor retornou uma resposta inválida.");
      }

      return {};
    }

    return response.json();
  }

  async function api(path = "", options = {}) {
    const response = await fetch(`${API_URL}/sales${path}`, {
      credentials: "include",
      ...options,
    });

    if (response.status === 401) {
      window.location.href = "./login.html";
      throw new Error("Sua sessão expirou.");
    }

    const data = await readResponse(response);

    if (!response.ok) {
      throw new Error(
        data.error || data.message || "Não foi possível concluir a operação.",
      );
    }

    return data;
  }

  function createNode(tag, content = "", className = "") {
    const element = document.createElement(tag);

    element.textContent = content;

    if (className) {
      element.className = className;
    }

    return element;
  }

  function addCell(row, content = "", className = "") {
    const cell = createNode("td", content, className);

    row.append(cell);

    return cell;
  }

  function normalizeVehicle(vehicle) {
    return {
      ...vehicle,
      id: vehicle.id,
      brand: text(vehicle.brand, "Veículo"),
      model: text(vehicle.model, "sem modelo"),
      year: vehicle.year || "—",
      status: vehicle.status || "available",
      price: number(vehicle.price),
      purchase_price:
        vehicle.purchase_price == null ? null : number(vehicle.purchase_price),
      expenses_total: number(vehicle.expenses_total),
    };
  }

  function normalizeSale(sale) {
    return {
      ...sale,
      sale_price: number(sale.sale_price),
      purchase_price: number(sale.purchase_price),
      expenses_total: number(sale.expenses_total),
      profit: number(sale.profit),
      vehicle_label: text(sale.vehicle_label, "Veículo não informado"),
      buyer_name: text(sale.buyer_name, "Comprador não informado"),
    };
  }

  async function loadVehicles() {
    const data = await api("/vehicles");

    vehicles = Array.isArray(data.vehicles)
      ? data.vehicles.map(normalizeVehicle)
      : [];

    const select = $("vehicleSelect");

    select.replaceChildren(new Option("Selecione um veículo", ""));

    vehicles.forEach((vehicle) => {
      const reserved = vehicle.status === "reserved" ? " (reservado)" : "";

      select.add(
        new Option(
          `${vehicle.brand} ${vehicle.model} • ${vehicle.year} • #${vehicle.id}${reserved}`,
          vehicle.id,
        ),
      );
    });
  }

  async function loadSellers() {
    const select = $("sellerSelect");

    if (!select) return;

    select.disabled = true;
    select.replaceChildren(new Option("Carregando vendedores...", ""));

    try {
      const data = await api("/sellers");

      sellers = Array.isArray(data.sellers) ? data.sellers : [];

      if (!sellers.length) {
        select.replaceChildren(
          new Option("Nenhum vendedor disponível", ""),
        );

        select.disabled = true;
        $("confirmSale").disabled = true;

        return;
      }

      select.replaceChildren(new Option("Selecione um vendedor", ""));

      sellers.forEach((seller) => {
        select.add(new Option(seller.name, seller.id));
      });

      select.disabled = false;
    } catch {
      select.replaceChildren(
        new Option("Não foi possível carregar vendedores", ""),
      );

      select.disabled = true;
    }
  }

  // Precisa rodar depois de saleForm.reset(): o reset devolve o select ao
  // primeiro option, o que desfaria a trava do vendedor se aplicada antes.
  function applySellerLock() {
    if (currentUser?.role !== "vendedor") return;

    const select = $("sellerSelect");

    if (!select || !sellers.length) return;

    select.value = String(currentUser.id);
    select.disabled = true;
  }

  function buildSalesQuery() {
    const params = new URLSearchParams({
      status: $("saleStatus")?.value || "active",
    });

    if ($("startDate")?.value) {
      params.set("start", $("startDate").value);
    }

    if ($("endDate")?.value) {
      params.set("end", $("endDate").value);
    }

    return params;
  }

  async function loadSales() {
    const version = ++requestVersion;

    salesAbortController?.abort();
    salesAbortController = new AbortController();

    try {
      const data = await api(`?${buildSalesQuery()}`, {
        signal: salesAbortController.signal,
      });

      if (version !== requestVersion) return;

      sales = Array.isArray(data.sales) ? data.sales.map(normalizeSale) : [];

      renderSales();
    } catch (error) {
      if (error.name === "AbortError" || version !== requestVersion) {
        return;
      }

      sales = [];
      renderSales();

      [
        "salesCount",
        "salesRevenue",
        "salesProfit",
        "salesAverageTicket",
      ].forEach((id) => {
        setText(id, "—");
      });

      renderLoadError();

      throw error;
    }
  }

  function renderLoadError() {
    const body = $("salesRows");

    body.replaceChildren();

    const row = document.createElement("tr");

    const cell = addCell(
      row,
      "Não foi possível carregar. Use Filtrar para tentar novamente.",
      "sales-empty",
    );

    cell.colSpan = 6;

    body.append(row);
  }

  function calculateSummary() {
    const active = sales.filter((sale) => !sale.cancelled_at);

    const revenue = active.reduce((sum, sale) => sum + sale.sale_price, 0);

    const profit = active.reduce((sum, sale) => sum + sale.profit, 0);

    const averageTicket = active.length ? revenue / active.length : 0;

    const margin = revenue ? (profit / revenue) * 100 : 0;

    return {
      active,
      revenue,
      profit,
      averageTicket,
      margin,
    };
  }

  function renderSummary(summary) {
    setText("salesCount", String(summary.active.length));

    setText("salesRevenue", money(summary.revenue));

    setText("salesProfit", money(summary.profit));

    setText("salesAverageTicket", money(summary.averageTicket));

    const formattedMargin = `${summary.margin.toFixed(1).replace(".", ",")}%`;

    setText("salesMargin", formattedMargin);
    setText("salesInsightMargin", formattedMargin);

    setText("historyCount", `${sales.length} registro(s)`);

    const profitElement = $("salesProfit");

    if (profitElement) {
      profitElement.className =
        summary.profit < 0 ? "sales-negative" : "sales-positive";
    }

    renderIntelligence(summary);
    renderPerformance(summary.active);
  }

  function renderPerformance(activeSales) {
    const container = $("salesPerformance");

    if (!container) return;

    container.replaceChildren();

    if (!activeSales.length) {
      container.append(
        createNode(
          "p",
          "Sem vendas para calcular a performance.",
          "sales-empty-state",
        ),
      );

      return;
    }

    const groups = new Map();

    activeSales.forEach((sale) => {
      const key = sale.seller_id == null ? "unassigned" : String(sale.seller_id);

      const label =
        sale.seller_id == null
          ? "Vendedor não informado"
          : text(sale.seller_name, `Vendedor #${sale.seller_id}`);

      const current = groups.get(key) || { label, count: 0, revenue: 0 };

      current.count += 1;
      current.revenue += sale.sale_price;

      groups.set(key, current);
    });

    const ranking = [...groups.values()].sort((a, b) => b.revenue - a.revenue);

    const maximum = Math.max(...ranking.map((group) => group.revenue), 1);

    const header = createNode("div", "", "sales-performance-header");

    header.append(
      createNode("span", "Vendedor"),
      createNode("span", "Vendas"),
      createNode("span", "Valor vendido"),
    );

    container.append(header);

    let colorIndex = 0;

    ranking.slice(0, 6).forEach((group) => {
      const isUnassigned = group.label === "Vendedor não informado";

      const color = isUnassigned
        ? SELLER_FALLBACK_COLOR
        : SELLER_COLORS[colorIndex++ % SELLER_COLORS.length];

      const item = createNode("div", "", "sales-performance-item");

      const info = createNode("div", "", "sales-performance-info");

      info.append(createNode("strong", group.label, "sales-performance-name"));

      const track = createNode("div", "", "sales-performance-track");

      const bar = createNode("span", "", "sales-performance-bar");

      bar.style.width = `${Math.max((group.revenue / maximum) * 100, 6)}%`;
      bar.style.background = color;

      track.append(bar);
      info.append(track);

      item.append(
        info,
        createNode("span", String(group.count), "sales-performance-count"),
        createNode("span", money(group.revenue), "sales-performance-value"),
      );

      container.append(item);
    });
  }

  function renderIntelligence(summary) {
    const criticalMarginSales = summary.active.filter((sale) => {
      if (!sale.sale_price) {
        return false;
      }

      const margin = (sale.profit / sale.sale_price) * 100;

      return margin >= 0 && margin < 5;
    });

    const attentionMarginSales = summary.active.filter((sale) => {
      if (!sale.sale_price) {
        return false;
      }

      const margin = (sale.profit / sale.sale_price) * 100;

      return margin >= 5 && margin < 12;
    });

    const negativeSales = summary.active.filter((sale) => sale.profit < 0);

    let title = "Sua operação comercial está em dia";

    let description =
      "Continue acompanhando margem e ticket médio das próximas vendas.";

    let level = "success";

    if (!summary.active.length) {
      title = "Nenhuma venda encontrada neste período";

      description =
        "Ajuste os filtros ou registre uma nova venda para iniciar a análise.";

      level = "neutral";
    } else if (negativeSales.length) {
      title = `${negativeSales.length} venda(s) com resultado negativo`;

      description =
        "Revise os custos cadastrados e a estratégia de preço desses negócios.";

      level = "critical";
    } else if (criticalMarginSales.length) {
      title = `${criticalMarginSales.length} venda(s) com margem crítica`;

      description =
        "Revise descontos, custo de compra e despesas antes de repetir esse tipo de negociação.";

      level = "critical";
    } else if (attentionMarginSales.length) {
      title = `${attentionMarginSales.length} venda(s) com margem que exige atenção`;

      description =
        "A margem está positiva, mas abaixo da referência inicial de 12%.";

      level = "attention";
    }

    setText("salesAiTitle", title);

    setText("salesAiDescription", description);

    const card = $("salesAiRecommendation");

    if (card) {
      card.dataset.level = level;
    }

    const best = [...summary.active].sort((a, b) => b.profit - a.profit)[0];

    setText("bestSaleVehicle", best?.vehicle_label || "Sem dados no período");

    setText(
      "bestSaleProfit",
      best ? `${money(best.profit)} de resultado` : "—",
    );
  }

  function renderSales() {
    const summary = calculateSummary();

    renderSummary(summary);

    const body = $("salesRows");

    body.replaceChildren();

    if (!sales.length) {
      const row = document.createElement("tr");

      const empty = addCell(
        row,
        "Nenhuma venda neste período. Registre uma venda ou ajuste os filtros.",
        "sales-empty",
      );

      empty.colSpan = 6;

      body.append(row);

      return;
    }

    sales.forEach((sale) => {
      const row = document.createElement("tr");

      if (sale.cancelled_at) {
        row.classList.add("is-cancelled");
      }

      const info = addCell(row);

      info.append(
        createNode("strong", sale.vehicle_label),
        createNode("small", sale.buyer_name),
        createNode(
          "small",
          `Vendedor: ${text(sale.seller_name, "não informado")}`,
          "sales-seller-tag",
        ),
      );

      addCell(row, formatDate(sale.sale_date));

      addCell(row, money(sale.sale_price));

      addCell(
        row,
        money(sale.profit),
        sale.profit < 0 ? "sales-negative" : "sales-positive",
      );

      const statusCell = addCell(row);

      statusCell.append(
        createNode(
          "span",
          sale.cancelled_at ? "Cancelada" : "Concluída",
          `sales-badge ${sale.cancelled_at ? "is-cancelled" : "is-complete"}`,
        ),
      );

      const detailButton = createNode("button", "Detalhes", "sales-secondary");

      detailButton.type = "button";

      detailButton.addEventListener("click", () => showDetails(sale));

      addCell(row).append(detailButton);

      body.append(row);
    });
  }

  function previewSale() {
    const vehicle = vehicles.find(
      (item) => String(item.id) === $("vehicleSelect").value,
    );

    const preview = $("salePreview");

    preview.replaceChildren();

    if (!vehicle) {
      preview.textContent = "Selecione um veículo para conferir os custos.";

      $("confirmSale").disabled = true;

      return;
    }

    $("saleDate").min = vehicle.entry_date?.slice(0, 10) || "";

    if (vehicle.purchase_price == null) {
      preview.append(
        createNode(
          "p",
          "Preço de compra não cadastrado. Preencha esse valor no veículo antes de vender.",
        ),
      );

      const editLink = createNode("a", "Editar veículo", "sales-link");

      editLink.href = `./vehicle-form.html?id=${encodeURIComponent(vehicle.id)}`;

      preview.append(editLink);

      $("confirmSale").disabled = true;

      return;
    }

    const totalCost = vehicle.purchase_price + vehicle.expenses_total;

    const expectedProfit = number($("salePrice").value) - totalCost;

    const lines = [
      ["Compra", money(vehicle.purchase_price)],
      ["Despesas cadastradas", money(vehicle.expenses_total)],
      ["Resultado previsto", money(expectedProfit)],
    ];

    lines.forEach(([label, value], index) => {
      const row = createNode("div", "", index === 2 ? "preview-total" : "");

      row.append(
        createNode("span", label),
        createNode(
          "strong",
          value,
          index === 2
            ? expectedProfit < 0
              ? "sales-negative"
              : "sales-positive"
            : "",
        ),
      );

      preview.append(row);
    });

    $("confirmSale").disabled = submitting || number($("salePrice").value) <= 0;
  }

  async function openSale(vehicleId = "") {
    showMessage("pageMessage");

    $("newSaleButton").disabled = true;

    try {
      await Promise.all([loadVehicles(), loadSellers()]);

      $("saleForm").reset();

      applySellerLock();

      if (window.CustomerPicker?.load) {
        await CustomerPicker.load(
          $("saleForm"),
          new URLSearchParams(location.search).get("customer"),
        );
      }

      showMessage("formMessage");

      $("saleDate").value = localToday;
      $("saleDate").max = localToday;

      if (vehicleId) {
        $("vehicleSelect").value = String(vehicleId);
      }

      const vehicle = vehicles.find(
        (item) => String(item.id) === $("vehicleSelect").value,
      );

      $("salePrice").value = vehicle?.price || "";

      previewSale();

      $("saleDialog").showModal();

      if (!vehicles.length) {
        showMessage(
          "formMessage",
          "Não há veículos disponíveis ou reservados para venda.",
          true,
        );
      }
    } catch (error) {
      showMessage("pageMessage", error.message, true);
    } finally {
      $("newSaleButton").disabled = false;
    }
  }

  function showDetails(sale) {
    selectedSale = sale;

    showMessage("detailMessage");

    $("cancelReason").value = "";

    $("cancelForm").hidden = Boolean(sale.cancelled_at);

    $("sendToDispatcherButton").hidden = Boolean(sale.cancelled_at);

    const details = createNode("dl", "", "sales-details");

    const fields = [
      ["Veículo", sale.vehicle_label],
      ["Vendedor", text(sale.seller_name, "Não informado")],
      ["Comprador", sale.buyer_name],
      ["Telefone", text(sale.buyer_phone)],
      ["Data", formatDate(sale.sale_date)],
      [
        "Pagamento",
        paymentMethods[sale.payment_method] || text(sale.payment_method),
      ],
      ["Valor da venda", money(sale.sale_price)],
      ["Custo de compra", money(sale.purchase_price)],
      ["Despesas na confirmação", money(sale.expenses_total)],
      ["Resultado", money(sale.profit)],
      ["Observações", text(sale.notes, "Sem observações")],
    ];

    if (sale.cancelled_at) {
      fields.push([
        "Cancelamento",
        text(sale.cancellation_reason, "Motivo não informado"),
      ]);
    }

    fields.forEach(([label, value]) => {
      const item = document.createElement("div");

      item.append(createNode("dt", label), createNode("dd", value));

      details.append(item);
    });

    $("saleDetails").replaceChildren(details);

    $("detailDialog").showModal();
  }

  async function sendToDispatcher() {
    if (submitting || !selectedSale) {
      return;
    }

    submitting = true;

    $("sendToDispatcherButton").disabled = true;

    showMessage("detailMessage");

    try {
      const response = await fetch(
        `${API_URL}/dispatcher/from-sale/${encodeURIComponent(selectedSale.id)}`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (response.status === 401) {
        location.href = "./login.html";
        return;
      }

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível enviar ao despachante.",
        );
      }

      if (!data.process?.id) {
        throw new Error("O processo foi criado sem um identificador válido.");
      }

      location.href = `./despachante-detail.html?id=${encodeURIComponent(data.process.id)}`;
    } catch (error) {
      showMessage("detailMessage", error.message, true);
    } finally {
      submitting = false;

      $("sendToDispatcherButton").disabled = false;
    }
  }

  async function submitSale(event) {
    event.preventDefault();

    if (submitting) return;

    submitting = true;

    $("confirmSale").disabled = true;

    showMessage("formMessage");

    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));

      body.vehicle_id = number(body.vehicle_id);

      body.sale_price = number(body.sale_price);

      await api("", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      $("saleDialog").close();

      showMessage(
        "pageMessage",
        "Venda registrada com sucesso. O veículo foi marcado como vendido.",
      );

      try {
        await loadSales();
      } catch {
        showMessage(
          "pageMessage",
          "A venda foi registrada, mas o histórico não atualizou. Clique em Filtrar para recarregar.",
          true,
        );
      }
    } catch (error) {
      showMessage("formMessage", error.message, true);
    } finally {
      submitting = false;

      previewSale();
    }
  }

  async function cancelSale(event) {
    event.preventDefault();

    if (submitting || !selectedSale) {
      return;
    }

    const confirmed = window.confirm(
      "Confirmar o cancelamento e devolver o veículo ao estoque?",
    );

    if (!confirmed) return;

    submitting = true;

    $("cancelSaleButton").disabled = true;

    showMessage("detailMessage");

    try {
      await api(`/${encodeURIComponent(selectedSale.id)}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: $("cancelReason").value.trim(),
        }),
      });

      $("detailDialog").close();

      showMessage(
        "pageMessage",
        "Venda cancelada. O veículo voltou ao status anterior.",
      );

      try {
        await loadSales();
      } catch {
        showMessage(
          "pageMessage",
          "Cancelamento concluído. Clique em Filtrar para atualizar o histórico.",
          true,
        );
      }
    } catch (error) {
      showMessage("detailMessage", error.message, true);
    } finally {
      submitting = false;

      $("cancelSaleButton").disabled = false;
    }
  }

  function bindEvents() {
    $("sendToDispatcherButton").addEventListener("click", sendToDispatcher);

    $("vehicleSelect").addEventListener("change", () => {
      const vehicle = vehicles.find(
        (item) => String(item.id) === $("vehicleSelect").value,
      );

      $("salePrice").value = vehicle?.price || "";

      previewSale();
    });

    $("salePrice").addEventListener("input", previewSale);

    $("newSaleButton").addEventListener("click", () => openSale());

    function showAiSummary() {
      const summary = calculateSummary();

      const messageText = summary.active.length
        ? `Resumo automático: ${summary.active.length} venda(s), ${money(summary.revenue)} em receita, ${money(summary.profit)} de resultado e margem de ${summary.margin.toFixed(1).replace(".", ",")}%.`
        : "Ainda não há vendas no período selecionado para uma análise completa.";

      showMessage("pageMessage", messageText, false);

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }

    // Mesma ação nos dois botões: o de cima precisa produzir um resultado
    // visível por si só, sem depender de rolar até o cartão para "funcionar".
    $("salesAiButton")?.addEventListener("click", showAiSummary);
    $("salesAiRecommendationButton")?.addEventListener("click", showAiSummary);

    document.querySelectorAll("[data-close]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!submitting) {
          $(button.dataset.close)?.close();
        }
      });
    });

    ["saleDialog", "detailDialog"].forEach((id) => {
      $(id).addEventListener("cancel", (event) => {
        if (submitting) {
          event.preventDefault();
        }
      });
    });

    $("filters").addEventListener("submit", async (event) => {
      event.preventDefault();

      showMessage("pageMessage");

      try {
        await loadSales();
      } catch (error) {
        showMessage("pageMessage", error.message, true);
      }
    });

    $("clearFilters").addEventListener("click", () => {
      $("filters").reset();

      $("filters").requestSubmit();
    });

    $("saleForm").addEventListener("submit", submitSale);

    $("cancelForm").addEventListener("submit", cancelSale);
  }

  async function start() {
    bindEvents();

    const user = await requireAuth();

    if (!user) return;

    if (!["admin", "vendedor"].includes(user.role)) {
      showMessage(
        "pageMessage",
        "A área de vendas está disponível apenas para administradores e vendedores.",
        true,
      );

      return;
    }

    currentUser = user;

    $("newSaleButton").disabled = false;

    const params = new URLSearchParams(location.search);

    try {
      if (params.get("sale")) {
        $("saleStatus").value = "all";
      }

      await loadSales();

      const saleId = params.get("sale");

      if (saleId) {
        const linkedSale = sales.find((sale) => String(sale.id) === saleId);

        if (linkedSale) {
          showDetails(linkedSale);
        } else {
          showMessage("pageMessage", "Venda não encontrada.", true);
        }
      }

      const vehicleId = params.get("vehicle");

      if (vehicleId || params.has("customer")) {
        await openSale(vehicleId);
      }
    } catch (error) {
      showMessage("pageMessage", error.message, true);
    }
  }

  start().catch((error) => {
    console.error("Erro ao iniciar vendas:", error);

    showMessage(
      "pageMessage",
      "Não foi possível iniciar a área de vendas. Atualize a página e tente novamente.",
      true,
    );
  });
})();
