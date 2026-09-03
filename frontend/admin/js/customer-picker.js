window.CustomerPicker = (() => {
  const clientsByForm = new WeakMap();
  function apply(form) {
    const select = form.elements.customer_id,
      c = clientsByForm.get(form)?.find((c) => String(c.id) === select.value);
    for (const name of ["buyer_name", "buyer_phone"]) {
      const input = form.elements[name];
      input.readOnly = Boolean(c);
      input.value = c ? (name === "buyer_name" ? c.name : c.phone || "") : "";
    }
  }
  async function load(form, id = null) {
    let select = form.elements.customer_id;
    if (!select) {
      const label = document.createElement("label");
      label.className = "sales-full";
      label.textContent = "Cliente cadastrado (opcional)";
      select = document.createElement("select");
      select.name = "customer_id";
      label.append(select);
      form.querySelector(".sales-form-grid").prepend(label);
      select.addEventListener("change", () => apply(form));
    }
    const response = await fetch(`${API_URL}/customers`, {
      credentials: "include",
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Não foi possível carregar os clientes.");
    clientsByForm.set(form, data.customers);
    select.replaceChildren(new Option("Informar comprador sem vínculo", ""));
    data.customers
      .filter((c) => c.is_active || String(c.id) === String(id))
      .forEach((c) =>
        select.add(
          new Option(
            `${c.name}${c.phone ? " • " + c.phone : ""}${c.is_active ? "" : " (arquivado)"}`,
            c.id,
          ),
        ),
      );
    select.value = id ? String(id) : "";
    for (const name of ["buyer_name", "buyer_phone"])
      form.elements[name].readOnly = false;
    if (id) {
      if (!select.value) throw new Error("Cliente não encontrado.");
      apply(form);
    }
  }
  return { load };
})();
