(() => {
  try {
    document.body.classList.toggle(
      "light-theme",
      localStorage.getItem("carDealerAdminTheme") === "light",
    );
  } catch {}
  const $ = (id) => document.getElementById(id);
  const money = (value) =>
    Number(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  const date = (value) =>
    value?.slice(0, 10).split("-").reverse().join("/") || "—";
  const methods = {
    pix: "Pix",
    transfer: "Transferência",
    cash: "Dinheiro",
    financing: "Financiamento",
    mixed: "Misto / com troca",
  };
  let vehicles = [],
    sales = [],
    selectedSale = null,
    submitting = false,
    requestVersion = 0;
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  function message(id, text = "", error = false) {
    const el = $(id);
    el.textContent = text;
    el.hidden = !text;
    el.className = `sales-message ${error ? "error" : "success"}`;
  }
  async function api(path, options = {}) {
    const response = await fetch(`${API_URL}/sales${path}`, {
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
  async function loadVehicles() {
    const data = await api("/vehicles");
    vehicles = data.vehicles;
    $("vehicleSelect").replaceChildren(new Option("Selecione um veículo", ""));
    vehicles.forEach((v) =>
      $("vehicleSelect").add(
        new Option(
          `${v.brand} ${v.model} • ${v.year} • #${v.id}${v.status === "reserved" ? " (reservado)" : ""}`,
          v.id,
        ),
      ),
    );
  }
  async function loadSales() {
    const version = ++requestVersion;
    const params = new URLSearchParams({ status: $("saleStatus").value });
    if ($("startDate").value) params.set("start", $("startDate").value);
    if ($("endDate").value) params.set("end", $("endDate").value);
    try {
      const data = await api(`?${params}`);
      if (version !== requestVersion) return;
      sales = data.sales;
      renderSales();
    } catch (error) {
      if (version !== requestVersion) return;
      sales = [];
      renderSales();
      ["salesCount", "salesRevenue", "salesProfit"].forEach(
        (id) => ($(id).textContent = "—"),
      );
      $("salesRows").replaceChildren();
      const row = document.createElement("tr");
      cell(
        row,
        "Não foi possível carregar. Use Filtrar para tentar novamente.",
        "sales-empty",
      ).colSpan = 6;
      $("salesRows").append(row);
      throw error;
    }
  }
  function renderSales() {
    const active = sales.filter((s) => !s.cancelled_at);
    const total = (key) =>
      active.reduce((sum, s) => sum + Math.round(Number(s[key]) * 100), 0) /
      100;
    $("salesCount").textContent = active.length;
    $("salesRevenue").textContent = money(total("sale_price"));
    $("salesProfit").textContent = money(total("profit"));
    $("salesProfit").className =
      total("profit") < 0 ? "sales-negative" : "sales-positive";
    $("historyCount").textContent = `${sales.length} registro(s)`;
    $("salesRows").replaceChildren();
    if (!sales.length) {
      const row = document.createElement("tr");
      cell(
        row,
        "Nenhuma venda neste período. Registre uma venda ou ajuste os filtros.",
        "sales-empty",
      ).colSpan = 6;
      $("salesRows").append(row);
    }
    sales.forEach((s) => {
      const row = document.createElement("tr");
      const info = cell(row, "");
      info.append(node("strong", s.vehicle_label), node("small", s.buyer_name));
      cell(row, date(s.sale_date));
      cell(row, money(s.sale_price));
      cell(
        row,
        money(s.profit),
        Number(s.profit) < 0 ? "sales-negative" : "sales-positive",
      );
      cell(row, "").append(
        node("span", s.cancelled_at ? "Cancelada" : "Concluída", "sales-badge"),
      );
      const button = node("button", "Detalhes", "sales-secondary");
      button.type = "button";
      button.addEventListener("click", () => showDetails(s));
      cell(row, "").append(button);
      $("salesRows").append(row);
    });
  }
  function preview() {
    const vehicle = vehicles.find(
      (v) => String(v.id) === $("vehicleSelect").value,
    );
    const el = $("salePreview");
    el.replaceChildren();
    if (!vehicle) {
      el.textContent = "Selecione um veículo para conferir os custos.";
      $("confirmSale").disabled = true;
      return;
    }
    $("saleDate").min = vehicle.entry_date || "";
    if (vehicle.purchase_price == null) {
      el.append(
        node(
          "p",
          "Preço de compra não cadastrado. Preencha esse valor no veículo antes de vender.",
        ),
      );
      const link = node("a", "Editar veículo", "sales-link");
      link.href = `./vehicle-form.html?id=${vehicle.id}`;
      el.append(link);
      $("confirmSale").disabled = true;
      return;
    }
    const cost =
      Number(vehicle.purchase_price) + Number(vehicle.expenses_total);
    const profit = Number($("salePrice").value) - cost;
    [
      ["Compra", money(vehicle.purchase_price)],
      ["Despesas cadastradas", money(vehicle.expenses_total)],
      ["Resultado previsto", money(profit)],
    ].forEach(([label, value], i) => {
      const line = node("div", "", i === 2 ? "preview-total" : "");
      line.append(
        node("span", label),
        node(
          "strong",
          value,
          i === 2 ? (profit < 0 ? "sales-negative" : "sales-positive") : "",
        ),
      );
      el.append(line);
    });
    $("confirmSale").disabled = submitting;
  }
  async function openSale(vehicleId) {
    message("pageMessage");
    $("newSaleButton").disabled = true;
    try {
      await loadVehicles();
      $("saleForm").reset();
      await CustomerPicker.load(
        $("saleForm"),
        new URLSearchParams(location.search).get("customer"),
      );
      message("formMessage");
      $("saleDate").value = localToday;
      $("saleDate").max = localToday;
      if (vehicleId) $("vehicleSelect").value = vehicleId;
      const v = vehicles.find((v) => String(v.id) === $("vehicleSelect").value);
      $("salePrice").value = v?.price || "";
      preview();
      $("saleDialog").showModal();
      if (!vehicles.length)
        message(
          "formMessage",
          "Não há veículos disponíveis ou reservados para venda.",
          true,
        );
    } catch (error) {
      message("pageMessage", error.message, true);
    } finally {
      $("newSaleButton").disabled = false;
    }
  }
  function showDetails(s) {
    selectedSale = s;
    message("detailMessage");
    $("cancelReason").value = "";
    $("cancelForm").hidden = Boolean(s.cancelled_at);
    const dl = node("dl", "", "sales-details");
    const fields = [
      ["Veículo", s.vehicle_label],
      ["Comprador", s.buyer_name],
      ["Telefone", s.buyer_phone || "Não informado"],
      ["Data", date(s.sale_date)],
      ["Pagamento", methods[s.payment_method]],
      ["Valor da venda", money(s.sale_price)],
      ["Custo de compra", money(s.purchase_price)],
      ["Despesas na confirmação", money(s.expenses_total)],
      ["Resultado", money(s.profit)],
      ["Observações", s.notes || "Sem observações"],
    ];
    if (s.cancelled_at) fields.push(["Cancelamento", s.cancellation_reason]);
    fields.forEach(([label, value]) => {
      const div = document.createElement("div");
      div.append(node("dt", label), node("dd", value));
      dl.append(div);
    });
    $("saleDetails").replaceChildren(dl);
    $("detailDialog").showModal();
  }
  $("vehicleSelect").addEventListener("change", () => {
    const v = vehicles.find((v) => String(v.id) === $("vehicleSelect").value);
    $("salePrice").value = v?.price || "";
    preview();
  });
  $("salePrice").addEventListener("input", preview);
  $("newSaleButton").addEventListener("click", () => openSale());
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => {
      if (!submitting) $(b.dataset.close).close();
    }),
  );
  ["saleDialog", "detailDialog"].forEach((id) =>
    $(id).addEventListener("cancel", (e) => {
      if (submitting) e.preventDefault();
    }),
  );
  $("filters").addEventListener("submit", async (e) => {
    e.preventDefault();
    message("pageMessage");
    try {
      await loadSales();
    } catch (error) {
      message("pageMessage", error.message, true);
    }
  });
  $("clearFilters").addEventListener("click", () => {
    $("filters").reset();
    $("filters").requestSubmit();
  });
  $("saleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return;
    submitting = true;
    $("confirmSale").disabled = true;
    message("formMessage");
    try {
      const body = Object.fromEntries(new FormData(e.target));
      await api("", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      $("saleDialog").close();
      message(
        "pageMessage",
        "Venda registrada com sucesso. O veículo foi marcado como vendido.",
      );
      try {
        await loadSales();
      } catch {
        message(
          "pageMessage",
          "A venda foi registrada, mas o histórico não atualizou. Clique em Filtrar para recarregar.",
          true,
        );
      }
    } catch (error) {
      message("formMessage", error.message, true);
    } finally {
      submitting = false;
      preview();
    }
  });
  $("cancelForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting || !selectedSale) return;
    if (
      !window.confirm(
        "Confirmar o cancelamento e devolver o veículo ao estoque?",
      )
    )
      return;
    submitting = true;
    $("cancelSaleButton").disabled = true;
    message("detailMessage");
    try {
      await api(`/${selectedSale.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: $("cancelReason").value }),
      });
      $("detailDialog").close();
      message(
        "pageMessage",
        "Venda cancelada. O veículo voltou ao status anterior.",
      );
      try {
        await loadSales();
      } catch {
        message(
          "pageMessage",
          "Cancelamento concluído. Clique em Filtrar para atualizar o histórico.",
          true,
        );
      }
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      submitting = false;
      $("cancelSaleButton").disabled = false;
    }
  });
  requireAuth().then(async (user) => {
    if (!user) return;
    if (user.role !== "admin") {
      message(
        "pageMessage",
        "A área de vendas está disponível apenas para administradores.",
        true,
      );
      return;
    }
    $("newSaleButton").disabled = false;
    try {
      await loadSales();
      const saleId = new URLSearchParams(location.search).get("sale");
      if (saleId) {
        $("saleStatus").value = "all";
        await loadSales();
        const linkedSale = sales.find((s) => String(s.id) === saleId);
        if (linkedSale) showDetails(linkedSale);
        else message("pageMessage", "Venda não encontrada.", true);
      }
      const id = new URLSearchParams(location.search).get("vehicle");
      if (id || new URLSearchParams(location.search).has("customer"))
        await openSale(id);
    } catch (error) {
      message("pageMessage", error.message, true);
    }
  });
})();
