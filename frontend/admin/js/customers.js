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
  const labels = {
    draft: "Rascunho",
    sent: "Enviada",
    accepted: "Aceita",
    converted: "Convertida",
    rejected: "Recusada",
    cancelled: "Cancelada",
    expired: "Vencida",
  };
  let customers = [],
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
  async function api(path = "", options = {}) {
    const r = await fetch(`${API_URL}/customers${path}`, {
      credentials: "include",
      ...options,
    });
    if (r.status === 401) {
      location.href = "./login.html";
      throw new Error("Sua sessão expirou.");
    }
    const data = await r.json();
    if (!r.ok)
      throw new Error(data.error || "Não foi possível carregar os clientes.");
    return data;
  }
  const send = (path, method, body) =>
    api(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  function render() {
    $("activeCount").textContent = customers.filter((c) => c.is_active).length;
    $("archivedCount").textContent = customers.filter(
      (c) => !c.is_active,
    ).length;
    $("buyersCount").textContent = customers.filter(
      (c) => Number(c.sales_count) > 0,
    ).length;
    const q = $("search").value.trim().toLocaleLowerCase("pt-BR"),
      digits = q.replace(/\D/g, ""),
      status = $("statusFilter").value;
    const rows = customers.filter(
      (c) =>
        (status === "all" || c.is_active === (status === "active")) &&
        (`${c.name} ${c.phone || ""} ${c.email || ""} ${c.city || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(q) ||
          (digits.length >= 3 &&
            (c.phone || "").replace(/\D/g, "").includes(digits))),
    );
    $("recordCount").textContent = `${rows.length} cliente(s)`;
    $("customerRows").replaceChildren();
    if (!rows.length) {
      const row = el("tr", ""),
        td = el(
          "td",
          "Nenhum cliente encontrado. Cadastre um cliente ou ajuste os filtros.",
          "sales-empty",
        );
      td.colSpan = 6;
      row.append(td);
      $("customerRows").append(row);
      return;
    }
    rows.forEach((c) => {
      const row = el("tr", ""),
        name = el("td", "");
      name.append(
        el("strong", c.name),
        el("small", c.city || "Cidade não informada"),
      );
      row.append(name);
      const contact = el("td", "");
      contact.append(
        el("strong", c.phone || "Sem telefone"),
        el("small", c.email || "Sem e-mail"),
      );
      row.append(
        contact,
        el("td", c.proposals_count),
        el("td", c.sales_count),
        el("td", c.is_active ? "Ativo" : "Arquivado"),
      );
      const td = el("td", ""),
        b = el("button", "Ver ficha", "sales-secondary");
      b.type = "button";
      b.addEventListener("click", () => details(c.id));
      td.append(b);
      row.append(td);
      $("customerRows").append(row);
    });
  }
  async function refresh() {
    const version = ++requestVersion;
    try {
      const data = await api();
      if (version !== requestVersion) return;
      customers = data.customers;
      render();
    } catch (error) {
      if (version !== requestVersion) return;
      customers = [];
      render();
      ["activeCount", "archivedCount", "buyersCount"].forEach(
        (id) => ($(id).textContent = "—"),
      );
      $("customerRows").firstChild.firstChild.textContent =
        "Falha ao carregar. Clique em Atualizar para tentar novamente.";
      throw error;
    }
  }
  function form(c = null) {
    if (busy) return;
    editing = c;
    $("customerForm").reset();
    message("formMessage");
    $("customerTitle").textContent = c ? "Editar cliente" : "Novo cliente";
    if (c)
      for (const key of ["name", "phone", "email", "city", "notes"])
        $("customerForm").elements[key].value = c[key] || "";
    if ($("detailDialog").open) $("detailDialog").close();
    $("customerDialog").showModal();
  }
  async function details(id) {
    if (busy) return;
    busy = true;
    message("pageMessage");
    try {
      const data = await api(`/${id}/history`);
      selected = data.customer;
      message("detailMessage");
      $("detailTitle").textContent = selected.name;
      const dl = el("dl", "", "sales-details");
      [
        ["Telefone", selected.phone || "Não informado"],
        ["E-mail", selected.email || "Não informado"],
        ["Cidade", selected.city || "Não informada"],
        ["Situação", selected.is_active ? "Ativo" : "Arquivado"],
        ["Observações", selected.notes || "Sem observações"],
      ].forEach(([label, value]) => {
        const d = el("div", "");
        d.append(el("dt", label), el("dd", value));
        dl.append(d);
      });
      $("customerDetails").replaceChildren(dl);
      $("customerLeads").replaceChildren();
      if (!data.leads.length)
        $("customerLeads").append(
          el("p", "Nenhum lead vinculado.", "sales-footnote"),
        );
      data.leads.forEach((lead) => {
        const a = el(
          "a",
          `#${lead.id} • ${lead.name}`,
          "customer-history-item",
        );
        a.href = `./leads.html?lead=${lead.id}`;
        $("customerLeads").append(a);
      });
      $("customerActions").replaceChildren();
      const edit = el("button", "Editar", "sales-secondary");
      edit.type = "button";
      edit.addEventListener("click", () => form(selected));
      $("customerActions").append(edit);
      if (selected.is_active)
        for (const [label, page] of [
          ["Nova proposta", "proposals"],
          ["Nova venda", "sales"],
          ["Enviar para despachante", "despachante"],
        ]) {
          const a = el("a", label, "sales-primary");
          a.href = `./${page}.html?customer=${selected.id}`;
          $("customerActions").append(a);
        }
      const archive = el(
        "button",
        selected.is_active ? "Arquivar" : "Reativar",
        "sales-secondary",
      );
      archive.type = "button";
      archive.addEventListener("click", toggleStatus);
      $("customerActions").append(archive);
      for (const [id, records, type] of [
        ["customerProposals", data.proposals, "proposal"],
        ["customerSales", data.sales, "sale"],
      ]) {
        $(id).replaceChildren();
        if (!records.length)
          $(id).append(el("p", "Nenhum registro vinculado.", "sales-footnote"));
        records.forEach((r) => {
          const a = el(
            "a",
            `#${r.id} • ${r.vehicle_label}`,
            "customer-history-item",
          );
          a.href =
            type === "proposal"
              ? `./proposals.html?proposal=${r.id}`
              : `./sales.html?sale=${r.id}`;
          a.append(
            el(
              "small",
              `${money(type === "proposal" ? r.proposed_price : r.sale_price)} • ${type === "proposal" ? labels[r.effective_status] : r.cancelled_at ? "Cancelada" : "Concluída"}`,
            ),
          );
          $(id).append(a);
        });
      }
      $("detailDialog").showModal();
    } catch (error) {
      message("pageMessage", error.message, true);
    } finally {
      busy = false;
    }
  }
  async function toggleStatus() {
    if (busy) return;
    if (
      !confirm(
        selected.is_active
          ? "Arquivar cliente? O histórico será preservado."
          : "Reativar este cliente?",
      )
    )
      return;
    busy = true;
    message("detailMessage");
    try {
      await send(`/${selected.id}/status`, "PATCH", {
        is_active: !selected.is_active,
        version: selected.version,
      });
      $("detailDialog").close();
      message(
        "pageMessage",
        selected.is_active ? "Cliente arquivado." : "Cliente reativado.",
      );
      try {
        await refresh();
      } catch {
        message(
          "pageMessage",
          "Alteração salva. Clique em Atualizar para recarregar.",
          true,
        );
      }
    } catch (error) {
      message("detailMessage", error.message, true);
    } finally {
      busy = false;
    }
  }
  $("customerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    $("saveCustomer").disabled = true;
    message("formMessage");
    try {
      const body = Object.fromEntries(new FormData(e.target));
      if (editing) body.version = editing.version;
      await send(
        editing ? `/${editing.id}` : "",
        editing ? "PUT" : "POST",
        body,
      );
      $("customerDialog").close();
      message("pageMessage", "Cliente salvo com sucesso.");
      try {
        await refresh();
      } catch {
        message(
          "pageMessage",
          "Cliente salvo. Clique em Atualizar para recarregar.",
          true,
        );
      }
    } catch (error) {
      message("formMessage", error.message, true);
    } finally {
      busy = false;
      $("saveCustomer").disabled = false;
    }
  });
  $("newCustomer").addEventListener("click", () => form());
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
  ["customerDialog", "detailDialog"].forEach((id) =>
    $(id).addEventListener("cancel", (e) => {
      if (busy) e.preventDefault();
    }),
  );
  requireAuth().then(async (user) => {
    if (!user) return;
    if (user.role !== "admin") {
      message(
        "pageMessage",
        "A área de clientes está disponível apenas para administradores.",
        true,
      );
      return;
    }
    $("newCustomer").disabled = false;
    try {
      await refresh();
      const id = new URLSearchParams(location.search).get("customer");
      if (id) await details(id);
    } catch (error) {
      message("pageMessage", error.message, true);
    }
  });
})();
