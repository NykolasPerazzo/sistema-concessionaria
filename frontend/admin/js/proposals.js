(() => {
  try {
    document.body.classList.toggle(
      "light-theme",
      localStorage.getItem("carDealerAdminTheme") === "light",
    );
  } catch {}
  const $ = (id) => document.getElementById(id);
  const labels = {
    draft: "Rascunho",
    sent: "Enviada",
    accepted: "Aceita",
    converted: "Convertida",
    rejected: "Recusada",
    cancelled: "Cancelada",
    expired: "Vencida",
  };
  const methods = {
    pix: "Pix",
    transfer: "Transferência",
    cash: "Dinheiro",
    financing: "Financiamento",
    mixed: "Misto / com troca",
  };
  const money = (n) =>
    Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const day = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const date = (s) => s.slice(0, 10).split("-").reverse().join("/");
  let proposals = [],
    vehicles = [],
    editing = null,
    selected = null,
    busy = false,
    refreshVersion = 0;
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
      throw new Error(data.error || "Não foi possível carregar os dados.");
    return data;
  }
  const send = (path, method, body) =>
    api(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  async function refresh() {
    const version = ++refreshVersion;
    try {
      const data = await api("/proposals");
      if (version !== refreshVersion) return;
      proposals = data.proposals;
      render();
    } catch (error) {
      if (version !== refreshVersion) return;
      proposals = [];
      render();
      ["openCount", "acceptedCount", "convertedCount"].forEach(
        (id) => ($(id).textContent = "—"),
      );
      $("proposalRows").firstChild.firstChild.textContent =
        "Falha ao carregar. Clique em Atualizar para tentar novamente.";
      throw error;
    }
  }
  function render() {
    $("openCount").textContent = proposals.filter(
      (p) => p.effective_status === "sent",
    ).length;
    $("acceptedCount").textContent = proposals.filter(
      (p) => p.effective_status === "accepted",
    ).length;
    $("convertedCount").textContent = proposals.filter(
      (p) => p.status === "converted" && !p.sale_cancelled_at,
    ).length;
    const search = $("search").value.trim().toLocaleLowerCase("pt-BR"),
      status = $("statusFilter").value;
    const rows = proposals.filter(
      (p) =>
        (status === "all" || p.effective_status === status) &&
        `${p.id} ${p.buyer_name} ${p.vehicle_label}`
          .toLocaleLowerCase("pt-BR")
          .includes(search),
    );
    $("recordCount").textContent = `${rows.length} registro(s)`;
    $("proposalRows").replaceChildren();
    if (!rows.length) {
      const row = el("tr", "");
      const cell = el(
        "td",
        "Nenhuma proposta encontrada. Crie uma proposta ou ajuste os filtros.",
        "sales-empty",
      );
      cell.colSpan = 6;
      row.append(cell);
      $("proposalRows").append(row);
      return;
    }
    rows.forEach((p) => {
      const row = el("tr", "");
      const first = el("td", "");
      first.append(
        el("strong", `#${p.id} • ${p.buyer_name}`),
        el("small", p.buyer_phone || "Telefone não informado"),
      );
      row.append(first);
      [p.vehicle_label, money(p.proposed_price), date(p.valid_until)].forEach(
        (v) => row.append(el("td", v)),
      );
      const state = el("td", "");
      state.append(el("span", labels[p.effective_status], "sales-badge"));
      if (p.sale_cancelled_at) state.append(el("small", "Venda cancelada"));
      row.append(state);
      const cell = el("td", ""),
        button = el("button", "Detalhes", "sales-secondary");
      button.type = "button";
      button.addEventListener("click", () => showDetails(p));
      cell.append(button);
      row.append(cell);
      $("proposalRows").append(row);
    });
  }
  async function openForm(proposal = null) {
    if (busy) return;
    busy = true;
    $("newProposal").disabled = true;
    message("pageMessage");
    message("formMessage");
    try {
      vehicles = (await api("/sales/vehicles")).vehicles;
      editing = proposal;
      $("proposalForm").reset();
      $("proposalTitle").textContent = proposal
        ? `Editar proposta #${proposal.id}`
        : "Nova proposta";
      $("vehicleSelect").replaceChildren(
        new Option("Selecione um veículo", ""),
      );
      vehicles.forEach((v) =>
        $("vehicleSelect").add(
          new Option(`${v.brand} ${v.model} • ${v.year} • #${v.id}`, v.id),
        ),
      );
      if (proposal && !vehicles.some((v) => v.id === proposal.vehicle_id)) {
        $("vehicleSelect").add(
          new Option(
            `${proposal.vehicle_label} (indisponível)`,
            proposal.vehicle_id,
          ),
        );
      }
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 7);
      $("validUntil").min = day(new Date());
      $("validUntil").value = day(expiry);
      if (proposal) {
        for (const name of [
          "vehicle_id",
          "buyer_name",
          "buyer_phone",
          "proposed_price",
          "valid_until",
          "payment_method",
          "notes",
        ])
          $("proposalForm").elements[name].value = proposal[name] ?? "";
      }
      await CustomerPicker.load(
        $("proposalForm"),
        proposal ? proposal.customer_id : new URLSearchParams(location.search).get("customer"),
      );
      if ($("detailDialog").open) $("detailDialog").close();
      $("proposalDialog").showModal();
      if (!vehicles.length)
        message(
          "formMessage",
          "Nenhum veículo disponível para negociação.",
          true,
        );
    } catch (error) {
      message("pageMessage", error.message, true);
    } finally {
      busy = false;
      $("newProposal").disabled = false;
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
    $("proposalActions").append(b);
  }
  function showDetails(p) {
    selected = p;
    message("detailMessage");
    $("convertForm").hidden = true;
    $("proposalActions").replaceChildren();
    $("detailTitle").textContent = `Proposta #${p.id}`;
    const dl = el("dl", "", "sales-details");
    [
      ["Veículo", p.vehicle_label],
      ["Comprador", p.buyer_name],
      ["Telefone", p.buyer_phone || "Não informado"],
      ["Situação", labels[p.effective_status]],
      ["Valor negociado", money(p.proposed_price)],
      ["Válida até", date(p.valid_until)],
      ["Pagamento", methods[p.payment_method]],
      ["Condições", p.notes || "Sem observações"],
    ].forEach(([label, value]) => {
      const d = el("div", "");
      d.append(el("dt", label), el("dd", value));
      dl.append(d);
    });
    $("proposalDetails").replaceChildren(dl);
    $("detailHint").textContent =
      "Alterar a situação registra o andamento da negociação; não envia mensagens ao comprador.";
    if (p.status === "draft") action("Editar rascunho", () => openForm(p));
    if (p.effective_status === "draft")
      action("Marcar como enviada", () => changeStatus("sent"), true);
    if (p.effective_status === "sent") {
      action("Registrar aceite", () => changeStatus("accepted"), true);
      action("Marcar como recusada", () => changeStatus("rejected"));
    }
    if (p.effective_status === "accepted")
      action("Converter em venda", prepareConversion, true);
    if (["draft", "sent", "accepted"].includes(p.status))
      action("Cancelar proposta", () => changeStatus("cancelled"));
    if (p.status === "converted") {
      $("detailHint").textContent = p.sale_cancelled_at
        ? "A venda vinculada foi cancelada. Para renegociar, crie uma nova proposta."
        : "Esta proposta já foi convertida em venda.";
      const link = el("a", `Ver venda #${p.sale_id}`, "sales-secondary");
      link.href = `./sales.html?sale=${p.sale_id}`;
      $("proposalActions").append(link);
    }
    if (!$("detailDialog").open) $("detailDialog").showModal();
  }
  async function changeStatus(status) {
    if (busy) return;
    if (!window.confirm(`Confirmar: ${labels[status].toLowerCase()}?`)) return;
    busy = true;
    message("detailMessage");
    try {
      await send(`/proposals/${selected.id}/status`, "PATCH", {
        status,
        version: selected.version,
      });
      $("detailDialog").close();
      message("pageMessage", "Situação da proposta atualizada.");
      try {
        await refresh();
      } catch {
        message(
          "pageMessage",
          "Situação salva. Clique em Atualizar para recarregar o histórico.",
          true,
        );
      }
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
    }
  }
  async function prepareConversion() {
    if (busy) return;
    busy = true;
    message("detailMessage");
    try {
      const data = await api("/sales/vehicles"),
        v = data.vehicles.find((v) => v.id === selected.vehicle_id);
      if (!v)
        throw new Error("Este veículo não está mais disponível para venda.");
      if (v.purchase_price == null)
        throw new Error(
          "Preencha o preço de compra no cadastro do veículo antes de converter.",
        );
      const profit =
        Number(selected.proposed_price) -
        Number(v.purchase_price) -
        Number(v.expenses_total);
      $("conversionPreview").textContent =
        `Compra: ${money(v.purchase_price)} • Despesas: ${money(v.expenses_total)} • Resultado previsto: ${money(profit)}. Os custos serão conferidos novamente ao confirmar.`;
      $("saleDate").value = day(new Date());
      $("saleDate").max = day(new Date());
      $("saleDate").min = v.entry_date || "";
      $("convertForm").hidden = false;
      $("saleDate").focus();
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
    }
  }
  $("proposalForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    $("saveProposal").disabled = true;
    message("formMessage");
    try {
      const body = Object.fromEntries(new FormData(e.target));
      if (editing) body.version = editing.version;
      await send(
        editing ? `/proposals/${editing.id}` : "/proposals",
        editing ? "PUT" : "POST",
        body,
      );
      $("proposalDialog").close();
      message("pageMessage", "Rascunho salvo com sucesso.");
      try {
        await refresh();
      } catch {
        message(
          "pageMessage",
          "Rascunho salvo. Clique em Atualizar para recarregar.",
          true,
        );
      }
    } catch (error) {
      message("formMessage", error.message, true);
    } finally {
      busy = false;
      $("saveProposal").disabled = false;
    }
  });
  $("convertForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    $("convertButton").disabled = true;
    message("detailMessage");
    try {
      const result = await send(`/proposals/${selected.id}/convert`, "POST", {
        sale_date: $("saleDate").value,
      });
      $("detailDialog").close();
      message(
        "pageMessage",
        `Proposta convertida na venda #${result.sale.id}. Estoque atualizado.`,
      );
      try {
        await refresh();
      } catch {
        message(
          "pageMessage",
          "Venda registrada. Clique em Atualizar para recarregar.",
          true,
        );
      }
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
      $("convertButton").disabled = false;
    }
  });
  $("vehicleSelect").addEventListener("change", () => {
    const v = vehicles.find((v) => String(v.id) === $("vehicleSelect").value);
    $("proposedPrice").value = v?.price || "";
  });
  $("newProposal").addEventListener("click", () => openForm());
  $("search").addEventListener("input", render);
  $("statusFilter").addEventListener("change", render);
  $("filters").addEventListener("submit", async (e) => {
    e.preventDefault();
    message("pageMessage");
    try {
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
  ["proposalDialog", "detailDialog"].forEach((id) =>
    $(id).addEventListener("cancel", (e) => {
      if (busy) e.preventDefault();
    }),
  );
  requireAuth().then(async (user) => {
    if (!user) return;
    if (user.role !== "admin") {
      message(
        "pageMessage",
        "A área de propostas está disponível apenas para administradores.",
        true,
      );
      return;
    }
    $("newProposal").disabled = false;
    try {
      await refresh();
      const params = new URLSearchParams(location.search);
      if (params.has("customer")) await openForm();
      else if (params.has("proposal")) {
        const linked = proposals.find(
          (p) => String(p.id) === params.get("proposal"),
        );
        if (linked) showDetails(linked);
        else message("pageMessage", "Proposta não encontrada.", true);
      }
    } catch (error) {
      message("pageMessage", error.message, true);
    }
  });
})();
