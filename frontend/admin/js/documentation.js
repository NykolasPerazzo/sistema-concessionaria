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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "Não informado";
    const [year, month, day] = raw.split("-");
    return `${day}/${month}/${year}`;
  };

  const text = (value, fallback = "Não informado") =>
    String(value ?? "").trim() || fallback;

  function createNode(tag, content = "", className = "") {
    const element = document.createElement(tag);
    if (content) element.textContent = content;
    if (className) element.className = className;
    return element;
  }

  function addCell(row, content = "", className = "") {
    const cell = createNode("td", content, className);
    row.append(cell);
    return cell;
  }

  /* ==========================================
     CPF/CNPJ — checagem de dígito verificador
  ========================================== */

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function isValidCPF(value) {
    const cpf = onlyDigits(value);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
    let check = ((sum * 10) % 11) % 10;
    if (check !== Number(cpf[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
    check = ((sum * 10) % 11) % 10;
    return check === Number(cpf[10]);
  }

  function isValidCNPJ(value) {
    const cnpj = onlyDigits(value);
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    const calc = (base) => {
      const weights =
        base.length === 12
          ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
          : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const sum = base
        .split("")
        .reduce((acc, digit, i) => acc + Number(digit) * weights[i], 0);
      const rest = sum % 11;
      return rest < 2 ? 0 : 11 - rest;
    };
    const d1 = calc(cnpj.slice(0, 12));
    if (d1 !== Number(cnpj[12])) return false;
    const d2 = calc(cnpj.slice(0, 13));
    return d2 === Number(cnpj[13]);
  }

  function isValidDocumentNumber(value) {
    const digits = onlyDigits(value);
    if (!digits) return true;
    if (digits.length === 11) return isValidCPF(digits);
    if (digits.length === 14) return isValidCNPJ(digits);
    return false;
  }

  function isValidMoney(value) {
    if (!["number", "string"].includes(typeof value)) return false;
    if (!/^\d+(\.\d{1,2})?$/.test(String(value))) return false;
    const n = Number(value);
    return n > 0 && n <= 100000000;
  }

  /* ==========================================
     MÁSCARAS DE DIGITAÇÃO (CPF/CNPJ e R$)
     O valor exibido tem pontuação; o valor enviado ao backend
     continua normalizado (somente dígitos / número puro).
  ========================================== */

  function formatDocumentMask(rawValue) {
    const digits = onlyDigits(rawValue).slice(0, 14);
    let out = "";
    if (digits.length <= 11) {
      for (let i = 0; i < digits.length; i++) {
        if (i === 3 || i === 6) out += ".";
        if (i === 9) out += "-";
        out += digits[i];
      }
    } else {
      for (let i = 0; i < digits.length; i++) {
        if (i === 2 || i === 5) out += ".";
        if (i === 8) out += "/";
        if (i === 12) out += "-";
        out += digits[i];
      }
    }
    return out;
  }

  function displayDocumentNumber(value) {
    const digits = onlyDigits(value);
    return digits ? formatDocumentMask(digits) : "Não informado";
  }

  function bindDocumentMask(input) {
    input.addEventListener("input", () => {
      const caretAtEnd = input.selectionEnd === input.value.length;
      input.value = formatDocumentMask(input.value);
      if (caretAtEnd) input.setSelectionRange(input.value.length, input.value.length);
    });
  }

  // Digita-se em centavos (como em caixas eletrônicos): "12345" vira R$ 123,45.
  // O número puro (ex.: "123.45") fica em data-raw, usado no envio e na validação.
  function formatMoneyMask(rawValue) {
    const digits = onlyDigits(rawValue).slice(0, 12);
    if (!digits) return { display: "", raw: "" };
    const amount = Number(digits) / 100;
    return { display: money(amount), raw: amount.toFixed(2) };
  }

  function bindMoneyMask(input) {
    input.addEventListener("input", () => {
      const { display, raw } = formatMoneyMask(input.value);
      input.value = display;
      input.dataset.raw = raw;
    });
  }

  function setMoneyValue(input, rawNumber) {
    if (rawNumber === null || rawNumber === undefined || rawNumber === "") {
      input.value = "";
      input.dataset.raw = "";
      return;
    }
    const amount = Number(rawNumber);
    input.value = money(amount);
    input.dataset.raw = amount.toFixed(2);
  }

  /* ==========================================
     CONFIGURAÇÃO POR TIPO DE DOCUMENTO
  ========================================== */

  const TYPE_LABELS = {
    procuracao: "Procuração",
    contrato_compra_venda: "Contrato de compra e venda",
    recibo: "Recibo",
    autorizacao: "Autorização",
  };

  const TYPE_CONFIG = {
    procuracao: {
      primaryLabel: "Outorgante",
      secondaryLabel: "Outorgado",
      issueDateLabel: "Data de emissão",
      expirationLabel: "Validade",
      showExpiration: true,
      showOperationValue: false,
      showPaymentMethod: false,
      showFinalidade: true,
      showPoderes: true,
      showCondicoes: false,
      showReferenteA: false,
      showTipoAutorizacao: false,
      vehicleRequired: true,
      secondaryRequired: true,
      primaryDocumentRequired: true,
      secondaryDocumentRequired: true,
      companyField: "secondary",
    },
    contrato_compra_venda: {
      primaryLabel: "Vendedor",
      secondaryLabel: "Comprador",
      issueDateLabel: "Data da negociação",
      expirationLabel: "Validade",
      showExpiration: false,
      showOperationValue: true,
      operationLabel: "Valor de venda (R$)",
      showPaymentMethod: true,
      showFinalidade: false,
      showPoderes: false,
      showCondicoes: true,
      showReferenteA: false,
      showTipoAutorizacao: false,
      vehicleRequired: true,
      secondaryRequired: true,
      operationRequired: true,
      companyField: "primary",
    },
    recibo: {
      primaryLabel: "Pagador",
      secondaryLabel: "Recebedor",
      issueDateLabel: "Data do pagamento",
      expirationLabel: "Validade",
      showExpiration: false,
      showOperationValue: true,
      operationLabel: "Valor (R$)",
      showPaymentMethod: true,
      showFinalidade: false,
      showPoderes: false,
      showCondicoes: false,
      showReferenteA: true,
      showTipoAutorizacao: false,
      vehicleRequired: false,
      secondaryRequired: true,
      operationRequired: true,
      companyField: "secondary",
    },
    autorizacao: {
      primaryLabel: "Responsável",
      secondaryLabel: "Pessoa autorizada",
      issueDateLabel: "Data de início",
      expirationLabel: "Data de validade",
      showExpiration: true,
      showOperationValue: false,
      showPaymentMethod: false,
      showFinalidade: true,
      showPoderes: false,
      showCondicoes: false,
      showReferenteA: false,
      showTipoAutorizacao: true,
      vehicleRequired: true,
      secondaryRequired: true,
      companyField: "primary",
    },
  };

  const TIPO_AUTORIZACAO_LABELS = {
    retirar_veiculo: "retirar o veículo",
    dirigir_veiculo: "dirigir o veículo",
    representar_vistoria: "representar a revenda em vistoria",
    outro: "praticar o ato descrito na finalidade",
  };

  const PAYMENT_LABELS = {
    pix: "Pix",
    transfer: "Transferência",
    cash: "Dinheiro",
    financing: "Financiamento",
    mixed: "Misto / com troca",
  };

  const STATUS_LABELS = {
    draft: "Rascunho",
    awaiting_signature: "Aguardando assinatura",
    completed: "Concluído",
    issue: "Com pendência",
    cancelled: "Cancelado",
  };

  // Espelha backend/services/documents.service.js — só decide quais opções
  // oferecer no seletor de status; o backend é a autoridade final.
  const ALLOWED_TRANSITIONS = {
    draft: ["awaiting_signature", "completed", "issue", "cancelled"],
    awaiting_signature: ["draft", "completed", "issue", "cancelled"],
    issue: ["draft", "awaiting_signature", "completed", "cancelled"],
    completed: ["cancelled"],
    cancelled: [],
  };

  /* ==========================================
     ESTADO
  ========================================== */

  let vehicles = [];
  let customers = [];
  let companyName = "";
  let companyCity = "";
  let currentType = "procuracao";
  let editingId = null;
  let editingVersion = null;
  let editingLocked = false;
  let historyDocs = [];
  let historyPagination = { page: 1, pageSize: 10, total: 0, totalPages: 1 };
  let currentUser = null;
  let currentSaleId = null;

  /* ==========================================
     HTTP
  ========================================== */

  async function readResponse(response) {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      if (!response.ok)
        throw new Error("O servidor retornou uma resposta inválida.");
      return {};
    }
    return response.json();
  }

  async function api(base, path = "", options = {}) {
    const response = await fetch(`${API_URL}${base}${path}`, {
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

  const docsApi = (path = "", options = {}) => api("/documents", path, options);

  /* ==========================================
     MENSAGENS / TOASTS
  ========================================== */

  function showMessage(id, content = "", error = false) {
    const element = $(id);
    if (!element) return;
    element.textContent = content;
    element.hidden = !content;
    element.className = `doc-message ${error ? "error" : "success"}`;
  }

  function showToast(message, type = "success") {
    const container = $("toastContainer");
    if (!container) return;
    const toast = createNode("div", message, `doc-toast is-${type}`);
    container.append(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 250);
    }, 4200);
  }

  /* ==========================================
     MODAL DE CONFIRMAÇÃO (padrão usado em vehicles.js)
  ========================================== */

  const confirmModal = $("confirmModal");
  const confirmModalTitle = $("confirmModalTitle");
  const confirmModalMessage = $("confirmModalMessage");
  const confirmModalCancel = $("confirmModalCancel");
  const confirmModalConfirm = $("confirmModalConfirm");
  const confirmModalBackdrop = $("confirmModalBackdrop");

  function closeConfirmModal() {
    if (!confirmModal) return;
    confirmModal.classList.remove("is-visible");
    setTimeout(() => {
      confirmModal.hidden = true;
    }, 150);
  }

  function askConfirmation({ title, message, confirmText = "Confirmar" }) {
    return new Promise((resolve) => {
      if (
        !confirmModal ||
        !confirmModalTitle ||
        !confirmModalMessage ||
        !confirmModalCancel ||
        !confirmModalConfirm ||
        !confirmModalBackdrop
      ) {
        resolve(false);
        return;
      }
      confirmModalTitle.textContent = title;
      confirmModalMessage.textContent = message;
      confirmModalConfirm.textContent = confirmText;
      confirmModal.hidden = false;
      requestAnimationFrame(() => confirmModal.classList.add("is-visible"));

      function finish(result) {
        closeConfirmModal();
        confirmModalConfirm.removeEventListener("click", onConfirm);
        confirmModalCancel.removeEventListener("click", onCancel);
        confirmModalBackdrop.removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKeydown);
        resolve(result);
      }
      function onConfirm() {
        finish(true);
      }
      function onCancel() {
        finish(false);
      }
      function onKeydown(event) {
        if (event.key === "Escape") onCancel();
      }
      confirmModalConfirm.addEventListener("click", onConfirm);
      confirmModalCancel.addEventListener("click", onCancel);
      confirmModalBackdrop.addEventListener("click", onCancel);
      document.addEventListener("keydown", onKeydown);
    });
  }

  /* ==========================================
     DIALOGS NATIVOS (status / visualizar)
  ========================================== */

  function bindDialogClosers() {
    document.querySelectorAll("[data-close]").forEach((button) => {
      button.addEventListener("click", () => {
        const dialog = $(button.dataset.close);
        dialog?.close();
      });
    });
    document.querySelectorAll("dialog.doc-dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    });
  }

  /* ==========================================
     CARREGAMENTO DE DADOS REAIS
  ========================================== */

  async function loadVehicles() {
    const data = await api("/vehicles");
    vehicles = data.vehicles || [];
    const select = $("vehicleSelect");
    const current = select.value;
    select.replaceChildren(new Option("Selecione um veículo", ""));
    if (!vehicles.length) {
      select.append(
        new Option("Nenhum veículo disponível. Cadastre um veículo antes de gerar o documento.", ""),
      );
    }
    vehicles.forEach((vehicle) => {
      const label = `${text(vehicle.brand, "Veículo")} ${text(vehicle.model, "")} • ${vehicle.year || "?"}`;
      select.append(new Option(label.replace(/\s+/g, " ").trim(), vehicle.id));
    });
    if (current) select.value = current;
  }

  async function loadCustomers() {
    const data = await api("/customers");
    customers = data.customers || [];
    const select = $("clientSelect");
    const current = select.value;
    select.replaceChildren(new Option("Informar dados manualmente", ""));
    if (!customers.length) {
      select.append(
        new Option("Nenhum cliente disponível. Cadastre um cliente antes de gerar o documento.", ""),
      );
    }
    customers
      .filter((c) => c.is_active || String(c.id) === String(current))
      .forEach((c) => {
        select.append(
          new Option(
            `${c.name}${c.phone ? " • " + c.phone : ""}${c.is_active ? "" : " (arquivado)"}`,
            c.id,
          ),
        );
      });
    if (current) select.value = current;
  }

  async function loadSettings() {
    try {
      const data = await api("/settings", "/public");
      companyName = text(data.settings?.company_name, "Car Dealer IA");
      companyCity = text(data.settings?.company_city, "");
    } catch {
      companyName = "Car Dealer IA";
      companyCity = "";
    }
  }

  async function loadSummary() {
    try {
      const summary = await docsApi("/summary");
      $("statGenerated").textContent = summary.generatedThisMonth ?? 0;
      $("statAwaiting").textContent = summary.awaitingSignature ?? 0;
      $("statCompleted").textContent = summary.completed ?? 0;
      $("statIssues").textContent = summary.withIssues ?? 0;
    } catch (error) {
      showMessage("pageMessage", error.message, true);
    }
  }

  /* ==========================================
     VEÍCULO SELECIONADO → SNAPSHOT
  ========================================== */

  function getSelectedVehicle() {
    const id = $("vehicleSelect").value;
    if (!id) return null;
    return vehicles.find((v) => String(v.id) === id) || null;
  }

  function buildVehicleSnapshot(vehicle) {
    if (!vehicle) return {};
    return {
      label: `${text(vehicle.brand, "Veículo")} ${text(vehicle.model, "")} • ${vehicle.year || "?"}`
        .replace(/\s+/g, " ")
        .trim(),
      brand: vehicle.brand || "",
      model: vehicle.model || "",
      year: vehicle.year || "",
      color: vehicle.color || "",
      price: vehicle.price ?? "",
      plate: vehicle.license_plate || "",
      renavam: vehicle.renavam || "",
      chassis: vehicle.chassis_number || "",
    };
  }

  function renderVehicleSummary(snapshot) {
    const box = $("vehicleSummary");
    if (!snapshot || !snapshot.label) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    box.hidden = false;
    box.replaceChildren();
    const rows = [
      ["Marca", text(snapshot.brand)],
      ["Modelo", text(snapshot.model)],
      ["Ano", text(snapshot.year)],
      ["Cor", text(snapshot.color)],
      ["Placa", text(snapshot.plate)],
      ["RENAVAM", text(snapshot.renavam)],
      ["Chassi", text(snapshot.chassis)],
      ["Preço", snapshot.price !== "" && snapshot.price != null ? money(snapshot.price) : "Não informado"],
    ];
    rows.forEach(([label, value]) => {
      const cell = createNode("div");
      cell.append(createNode("span", label), createNode("strong", value));
      box.append(cell);
    });
  }

  function onVehicleChange() {
    renderVehicleSummary(buildVehicleSnapshot(getSelectedVehicle()));
    scheduleUpdate();
  }

  function onClientChange() {
    const id = $("clientSelect").value;
    const customer = customers.find((c) => String(c.id) === id);
    const nameInput = $("primaryName");
    if (customer) {
      nameInput.value = customer.name || "";
      nameInput.readOnly = true;
    } else {
      nameInput.readOnly = false;
    }
    scheduleUpdate();
  }

  /* ==========================================
     TROCA DE TIPO DE DOCUMENTO
  ========================================== */

  function applyType(type) {
    currentType = type;
    const config = TYPE_CONFIG[type];

    document.querySelectorAll("#documentTypeTabs .doc-tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.type === type);
    });

    $("labelClient").textContent = `Cliente cadastrado (vinculado ao ${config.primaryLabel.toLowerCase()})`;
    $("labelPrimaryName").textContent = config.primaryLabel;
    $("labelSecondaryName").textContent = config.secondaryLabel;
    $("labelIssueDate").textContent = config.issueDateLabel;
    $("labelExpirationDate").textContent = config.expirationLabel;
    $("labelOperationValue").textContent = config.operationLabel || "Valor da operação (R$)";

    document.querySelector(".doc-field-finalidade").hidden = !config.showFinalidade;
    document.querySelector(".doc-field-poderes").hidden = !config.showPoderes;
    document.querySelector(".doc-field-tipoAutorizacao").hidden = !config.showTipoAutorizacao;
    document.querySelector(".doc-field-operationValue").hidden = !config.showOperationValue;
    document.querySelector(".doc-field-paymentMethod").hidden = !config.showPaymentMethod;
    document.querySelector(".doc-field-referenteA").hidden = !config.showReferenteA;
    document.querySelector(".doc-field-condicoes").hidden = !config.showCondicoes;
    document.querySelector(".doc-field-expirationDate").hidden = !config.showExpiration;

    // Preenche automaticamente o campo correspondente à revenda, sem
    // sobrescrever o que o usuário já tiver digitado.
    if (config.companyField === "primary" && !$("primaryName").value.trim()) {
      $("primaryName").value = companyName;
    }
    if (config.companyField === "secondary" && !$("secondaryName").value.trim()) {
      $("secondaryName").value = companyName;
    }

    scheduleUpdate();
  }

  /* ==========================================
     COLETA DE DADOS DO FORMULÁRIO
  ========================================== */

  function collectFormData() {
    const config = TYPE_CONFIG[currentType];
    const vehicle = getSelectedVehicle();
    const vehicleSnapshot = buildVehicleSnapshot(vehicle);

    const documentData = {};
    if (config.showFinalidade) documentData.finalidade = $("finalidade").value.trim();
    if (config.showPoderes) documentData.poderes = $("poderes").value.trim();
    if (config.showTipoAutorizacao) documentData.tipo_autorizacao = $("tipoAutorizacao").value;
    if (config.showPaymentMethod) documentData.forma_pagamento = $("paymentMethod").value;
    if (config.showCondicoes) documentData.condicoes = $("condicoes").value.trim();
    if (config.showReferenteA) documentData.referente_a = $("referenteA").value.trim();
    const observations = $("observations").value.trim();
    if (observations) documentData.observacoes = observations;

    return {
      document_type: currentType,
      title: `${TYPE_LABELS[currentType]}${vehicleSnapshot.label ? " • " + vehicleSnapshot.label : ""}`,
      client_id: $("clientSelect").value || null,
      vehicle_id: $("vehicleSelect").value || null,
      sale_id: currentSaleId,
      participant_primary: {
        name: $("primaryName").value.trim(),
        document: onlyDigits($("primaryDocument").value),
      },
      participant_secondary: {
        name: $("secondaryName").value.trim(),
        document: onlyDigits($("secondaryDocument").value),
      },
      vehicle_snapshot: vehicleSnapshot,
      document_data: documentData,
      operation_value: config.showOperationValue ? $("operationValue").dataset.raw || "" : "",
      issue_date: $("issueDate").value,
      expiration_date: config.showExpiration ? $("expirationDate").value : "",
    };
  }

  /* ==========================================
     VALIDAÇÃO INTELIGENTE (local, sem IA)
  ========================================== */

  function computeValidation(data) {
    const config = TYPE_CONFIG[data.document_type];
    const errors = [];
    const warnings = [];

    if (!data.participant_primary.name)
      errors.push(`Informe o nome: ${config.primaryLabel}.`);
    if (config.secondaryRequired && !data.participant_secondary.name)
      errors.push(`Informe o nome: ${config.secondaryLabel}.`);

    if (config.primaryDocumentRequired && !data.participant_primary.document)
      errors.push(`Informe o CPF/CNPJ de ${config.primaryLabel.toLowerCase()}.`);
    if (
      data.participant_primary.document &&
      !isValidDocumentNumber(data.participant_primary.document)
    )
      errors.push(`CPF/CNPJ de ${config.primaryLabel.toLowerCase()} inválido.`);

    if (config.secondaryDocumentRequired && !data.participant_secondary.document)
      errors.push(`Informe o CPF/CNPJ de ${config.secondaryLabel.toLowerCase()}.`);
    if (
      data.participant_secondary.document &&
      !isValidDocumentNumber(data.participant_secondary.document)
    )
      errors.push(`CPF/CNPJ de ${config.secondaryLabel.toLowerCase()} inválido.`);

    if (config.vehicleRequired && !data.vehicle_id)
      errors.push("Selecione um veículo.");

    if (data.vehicle_id) {
      const snapshot = data.vehicle_snapshot;
      if (!snapshot.plate) warnings.push("Placa do veículo não cadastrada.");
      if (!snapshot.renavam) warnings.push("RENAVAM do veículo não cadastrado.");
      if (!snapshot.chassis) warnings.push("Chassi do veículo não cadastrado.");
    } else if (!config.vehicleRequired) {
      warnings.push("Nenhum veículo vinculado a este documento.");
    }

    if (config.operationRequired && !data.operation_value)
      errors.push(`Informe ${(config.operationLabel || "o valor da operação").toLowerCase()}.`);
    if (data.operation_value && !isValidMoney(data.operation_value))
      errors.push("Valor da operação inválido.");

    if (config.showPaymentMethod && !data.document_data.forma_pagamento)
      warnings.push("Forma de pagamento não selecionada.");

    if (!data.issue_date)
      errors.push(`Informe a data: ${config.issueDateLabel.toLowerCase()}.`);
    if (config.showExpiration && !data.expiration_date)
      errors.push(`Informe: ${config.expirationLabel.toLowerCase()}.`);
    if (
      data.issue_date &&
      data.expiration_date &&
      data.expiration_date < data.issue_date
    )
      errors.push("A validade não pode ser anterior à emissão.");

    if (config.showFinalidade && !data.document_data.finalidade)
      errors.push("Informe a finalidade.");
    if (config.showPoderes && !data.document_data.poderes)
      errors.push("Descreva os poderes concedidos.");
    if (config.showTipoAutorizacao && !data.document_data.tipo_autorizacao)
      errors.push("Selecione o tipo de autorização.");
    if (config.showReferenteA && !data.document_data.referente_a)
      errors.push("Informe a que se refere o recibo.");

    if (!data.client_id)
      warnings.push("Nenhum cliente cadastrado vinculado — dados informados manualmente.");

    return { errors, warnings };
  }

  function renderValidation({ errors, warnings }) {
    const card = $("validationCard");
    const summary = $("validationSummary");
    const badge = $("validationBadge");
    const list = $("validationIssues");

    const level = errors.length ? "review" : warnings.length ? "incomplete" : "ok";
    card.dataset.level = level;

    if (level === "ok") {
      badge.textContent = "Dados conferidos";
      summary.textContent = "A IA encontrou todos os dados necessários para preencher este documento.";
    } else if (level === "incomplete") {
      badge.textContent = "Informações incompletas";
      summary.textContent = "Alguns dados recomendados ainda não foram informados.";
    } else {
      badge.textContent = "Revisão necessária";
      summary.textContent = "Corrija os campos indicados antes de gerar o documento.";
    }

    const issues = [...errors, ...warnings];
    list.replaceChildren();
    if (issues.length) {
      issues.forEach((issue) => list.append(createNode("li", issue)));
      list.hidden = false;
    } else {
      list.hidden = true;
    }

    return level;
  }

  /* ==========================================
     PRÉVIA (folha A4) — sempre via textContent
  ========================================== */

  function buildLeadParagraph(data) {
    const config = TYPE_CONFIG[data.document_type];
    const primaryName = text(data.participant_primary.name, "[outorgante não informado]");
    const secondaryName = text(data.participant_secondary.name, "[outorgado não informado]");
    const vehicleLabel = text(data.vehicle_snapshot.label, "veículo não informado");

    if (data.document_type === "procuracao") {
      return `Pelo presente instrumento particular de procuração, ${primaryName} outorga a ${secondaryName} os poderes necessários para ${text(data.document_data.finalidade, "a finalidade descrita neste documento").toLowerCase()}, relativamente ao veículo ${vehicleLabel}.`;
    }
    if (data.document_type === "contrato_compra_venda") {
      return `Pelo presente instrumento particular, ${primaryName} (vendedor) e ${secondaryName} (comprador) ajustam entre si a compra e venda do veículo ${vehicleLabel}, pelo valor de ${data.operation_value ? money(data.operation_value) : "[valor não informado]"}, nas condições descritas neste documento.`;
    }
    if (data.document_type === "recibo") {
      return `${secondaryName} recebeu de ${primaryName} a quantia de ${data.operation_value ? money(data.operation_value) : "[valor não informado]"}, referente a ${text(data.document_data.referente_a, "não informado").toLowerCase()}.`;
    }
    const acao = TIPO_AUTORIZACAO_LABELS[data.document_data.tipo_autorizacao] || "praticar o ato descrito na finalidade";
    return `${primaryName} autoriza ${secondaryName} a ${acao}, relativamente ao veículo ${vehicleLabel}, conforme descrito neste documento.`;
  }

  function buildSheet(container, data) {
    container.replaceChildren();

    const hasContent =
      data.participant_primary.name || data.participant_secondary.name || data.vehicle_id;

    if (!hasContent) {
      container.append(
        createNode(
          "div",
          "Preencha o formulário ao lado para visualizar a prévia do documento.",
          "doc-sheet-placeholder",
        ),
      );
      return;
    }

    const config = TYPE_CONFIG[data.document_type];

    const brand = createNode("div", "", "doc-sheet-brand");
    brand.append(
      createNode("strong", companyName || "Car Dealer IA"),
      createNode("span", TYPE_LABELS[data.document_type]),
    );
    container.append(brand);

    container.append(
      createNode("div", TYPE_LABELS[data.document_type], "doc-sheet-title"),
    );

    const lead = createNode("div", "", "doc-sheet-section");
    lead.append(createNode("p", buildLeadParagraph(data)));
    container.append(lead);

    function section(labelText, valueText) {
      const el = createNode("div", "", "doc-sheet-section");
      el.append(createNode("h4", labelText), createNode("p", valueText));
      container.append(el);
    }

    section(
      config.primaryLabel.toUpperCase(),
      `${text(data.participant_primary.name)}\nCPF/CNPJ: ${displayDocumentNumber(data.participant_primary.document)}`,
    );
    section(
      config.secondaryLabel.toUpperCase(),
      `${text(data.participant_secondary.name)}\nCPF/CNPJ: ${displayDocumentNumber(data.participant_secondary.document)}`,
    );

    const snapshot = data.vehicle_snapshot || {};
    section(
      "VEÍCULO",
      snapshot.label
        ? `${snapshot.label}\nPlaca: ${text(snapshot.plate)} • RENAVAM: ${text(snapshot.renavam)} • Chassi: ${text(snapshot.chassis)}`
        : "Não informado",
    );

    if (config.showOperationValue) {
      section(
        "VALOR",
        data.operation_value ? money(data.operation_value) : "Não informado",
      );
    }
    if (config.showPaymentMethod) {
      section(
        "FORMA DE PAGAMENTO",
        PAYMENT_LABELS[data.document_data.forma_pagamento] || "Não informado",
      );
    }
    if (config.showCondicoes) {
      section("CONDIÇÕES", text(data.document_data.condicoes));
    }
    if (config.showPoderes) {
      section("PODERES CONCEDIDOS", text(data.document_data.poderes));
    }
    if (config.showTipoAutorizacao) {
      section(
        "TIPO DE AUTORIZAÇÃO",
        TIPO_AUTORIZACAO_LABELS[data.document_data.tipo_autorizacao]
          ? TIPO_AUTORIZACAO_LABELS[data.document_data.tipo_autorizacao]
          : "Não informado",
      );
    }

    const dateText = config.showExpiration
      ? `${config.issueDateLabel}: ${formatDate(data.issue_date)}\n${config.expirationLabel}: ${formatDate(data.expiration_date)}`
      : `${config.issueDateLabel}: ${formatDate(data.issue_date)}`;
    section("DATAS", dateText);

    if (data.document_data.observacoes) {
      section("OBSERVAÇÕES", data.document_data.observacoes);
    }

    const signatures = createNode("div", "", "doc-sheet-signatures");
    signatures.append(
      createNode("div", `Assinatura de ${config.primaryLabel.toLowerCase()}`, "doc-sheet-signature"),
      createNode("div", `Assinatura de ${config.secondaryLabel.toLowerCase()}`, "doc-sheet-signature"),
    );
    container.append(signatures);

    container.append(
      createNode(
        "div",
        `${companyCity || "Local não informado"}, ${formatDate(new Date().toISOString())}.`,
        "doc-sheet-footer",
      ),
    );
  }

  function scheduleUpdate() {
    const data = collectFormData();
    const level = renderValidation(computeValidation(data));
    buildSheet($("documentPreview"), data);
    $("generateButton").disabled = level === "review";
    return data;
  }

  /* ==========================================
     FORMULÁRIO — limpar / salvar / gerar
  ========================================== */

  function setEditing(id, version, locked) {
    editingId = id;
    editingVersion = version;
    editingLocked = Boolean(locked);
    $("saveDraftButton").disabled = editingLocked;
    $("generateButton").disabled = editingLocked;
    if (editingLocked) {
      showMessage(
        "formMessage",
        "Documento concluído ou cancelado não pode ser editado. Use \"Alterar status\" no histórico, se necessário.",
        true,
      );
    } else {
      showMessage("formMessage", "");
    }
  }

  function clearForm() {
    $("documentForm").reset();
    $("operationValue").dataset.raw = "";
    $("vehicleSummary").hidden = true;
    $("vehicleSummary").replaceChildren();
    $("primaryName").readOnly = false;
    currentSaleId = null;
    setEditing(null, null, false);
    applyType("procuracao");
  }

  async function newDocumentFlow() {
    const hasContent =
      $("primaryName").value.trim() ||
      $("secondaryName").value.trim() ||
      $("vehicleSelect").value ||
      editingId;
    if (hasContent) {
      const confirmed = await askConfirmation({
        title: "Iniciar novo documento?",
        message: "Os dados não salvos do formulário atual serão perdidos.",
        confirmText: "Iniciar novo",
      });
      if (!confirmed) return;
    }
    clearForm();
    document.querySelector(".doc-generator-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function persistDocument(data) {
    if (editingId) {
      const response = await docsApi(`/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, version: editingVersion }),
      });
      editingVersion = response.document.version;
      return response.document;
    }
    const response = await docsApi("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    editingId = response.document.id;
    editingVersion = response.document.version;
    return response.document;
  }

  async function saveDraft() {
    const data = scheduleUpdate();
    if (!data.participant_primary.name) {
      showMessage("formMessage", "Informe ao menos o nome do participante principal para salvar o rascunho.", true);
      return;
    }
    try {
      $("saveDraftButton").disabled = true;
      await persistDocument(data);
      showMessage("formMessage", "Rascunho salvo.");
      showToast("Rascunho salvo.");
      await Promise.all([loadSummary(), loadHistory()]);
    } catch (error) {
      showMessage("formMessage", error.message, true);
      showToast(error.message, "error");
    } finally {
      $("saveDraftButton").disabled = editingLocked;
    }
  }

  async function generateDocument(event) {
    event.preventDefault();
    const data = scheduleUpdate();
    const { errors } = computeValidation(data);
    if (errors.length) {
      showMessage("formMessage", "Corrija os campos indicados na validação inteligente antes de gerar o documento.", true);
      return;
    }

    const confirmed = await askConfirmation({
      title: "Gerar documento?",
      message: `Confirma a geração deste ${TYPE_LABELS[data.document_type].toLowerCase()}? Revise os dados antes de confirmar — nada é enviado, assinado ou registrado automaticamente.`,
      confirmText: "Gerar documento",
    });
    if (!confirmed) return;

    try {
      $("generateButton").disabled = true;
      const saved = await persistDocument(data);
      if (saved.status === "draft" || saved.status === "issue") {
        const statusResponse = await docsApi(`/${saved.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "awaiting_signature", version: editingVersion }),
        });
        editingVersion = statusResponse.document.version;
      }
      showMessage("formMessage", "Documento gerado e registrado como aguardando assinatura.");
      showToast("Documento gerado com sucesso.");
      await Promise.all([loadSummary(), loadHistory()]);
    } catch (error) {
      showMessage("formMessage", error.message, true);
      showToast(error.message, "error");
    } finally {
      $("generateButton").disabled = editingLocked;
    }
  }

  /* ==========================================
     ABRIR DOCUMENTO EXISTENTE NO FORMULÁRIO
  ========================================== */

  function openDocumentForEdit(doc) {
    clearForm();
    applyType(doc.document_type);
    currentSaleId = doc.sale_id || null;

    $("clientSelect").value = doc.client_id ? String(doc.client_id) : "";
    $("vehicleSelect").value = doc.vehicle_id ? String(doc.vehicle_id) : "";
    // Recalcula a partir do cadastro atual do veículo (não do snapshot
    // histórico) para manter a prévia e o resumo sempre consistentes entre si.
    renderVehicleSummary(buildVehicleSnapshot(getSelectedVehicle()));

    $("primaryName").value = doc.participant_primary?.name || "";
    $("primaryDocument").value = formatDocumentMask(doc.participant_primary?.document || "");
    $("secondaryName").value = doc.participant_secondary?.name || "";
    $("secondaryDocument").value = formatDocumentMask(doc.participant_secondary?.document || "");
    if (doc.client_id) $("primaryName").readOnly = true;

    const dd = doc.document_data || {};
    $("finalidade").value = dd.finalidade || "";
    $("poderes").value = dd.poderes || "";
    $("tipoAutorizacao").value = dd.tipo_autorizacao || "";
    $("paymentMethod").value = dd.forma_pagamento || "";
    $("condicoes").value = dd.condicoes || "";
    $("referenteA").value = dd.referente_a || "";
    $("observations").value = dd.observacoes || "";

    setMoneyValue($("operationValue"), doc.operation_value);
    $("issueDate").value = doc.issue_date || "";
    $("expirationDate").value = doc.expiration_date || "";

    setEditing(doc.id, doc.version, ["completed", "cancelled"].includes(doc.status));
    scheduleUpdate();

    document.querySelector(".doc-generator-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ==========================================
     IMPRESSÃO A PARTIR DO HISTÓRICO
  ========================================== */

  function docRowToPreviewData(doc) {
    return {
      document_type: doc.document_type,
      participant_primary: doc.participant_primary || {},
      participant_secondary: doc.participant_secondary || {},
      vehicle_id: doc.vehicle_id,
      vehicle_snapshot: doc.vehicle_snapshot || {},
      document_data: doc.document_data || {},
      operation_value: doc.operation_value,
      issue_date: doc.issue_date,
      expiration_date: doc.expiration_date,
    };
  }

  function printDocumentRow(doc) {
    buildSheet($("documentPreview"), docRowToPreviewData(doc));
    window.print();
    // Restaura a prévia ligada ao formulário após o diálogo de impressão fechar.
    scheduleUpdate();
  }

  /* ==========================================
     VISUALIZAR (modal ampliado)
  ========================================== */

  function openViewDialog() {
    const data = scheduleUpdate();
    buildSheet($("viewDialogSheet"), data);
    $("viewDialog").showModal();
  }

  /* ==========================================
     ALTERAR STATUS
  ========================================== */

  let statusTargetDoc = null;

  function openStatusDialog(doc) {
    statusTargetDoc = doc;
    const select = $("statusSelect");
    select.replaceChildren();
    (ALLOWED_TRANSITIONS[doc.status] || []).forEach((status) => {
      select.append(new Option(STATUS_LABELS[status], status));
    });
    if (!select.options.length) {
      showToast("Este documento não permite mais mudanças de status.", "error");
      return;
    }
    $("statusReasonWrapper").hidden = select.value !== "cancelled";
    $("statusReason").value = "";
    showMessage("statusFormMessage", "");
    $("statusDialog").showModal();
  }

  async function submitStatusChange(event) {
    event.preventDefault();
    if (!statusTargetDoc) return;
    const status = $("statusSelect").value;
    const reason = $("statusReason").value.trim();
    if (status === "cancelled" && !reason) {
      showMessage("statusFormMessage", "Informe o motivo do cancelamento.", true);
      return;
    }
    try {
      await docsApi(`/${statusTargetDoc.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, version: statusTargetDoc.version, reason }),
      });
      $("statusDialog").close();
      showToast("Status atualizado.");
      await Promise.all([loadSummary(), loadHistory()]);
    } catch (error) {
      showMessage("statusFormMessage", error.message, true);
    }
  }

  /* ==========================================
     EXCLUIR
  ========================================== */

  async function deleteDocumentRow(doc) {
    const confirmed = await askConfirmation({
      title: "Excluir documento?",
      message: `Tem certeza que deseja excluir "${doc.title}"? Essa ação não pode ser desfeita.`,
      confirmText: "Excluir",
    });
    if (!confirmed) return;
    try {
      await docsApi(`/${doc.id}`, { method: "DELETE" });
      showToast("Documento excluído.");
      if (editingId === doc.id) clearForm();
      await Promise.all([loadSummary(), loadHistory()]);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  /* ==========================================
     HISTÓRICO
  ========================================== */

  function buildHistoryQuery() {
    const params = new URLSearchParams();
    const search = $("filterSearch").value.trim();
    if (search) params.set("search", search);
    params.set("type", $("filterType").value);
    params.set("status", $("filterStatus").value);
    if ($("filterStart").value) params.set("start", $("filterStart").value);
    if ($("filterEnd").value) params.set("end", $("filterEnd").value);
    params.set("page", String(historyPagination.page));
    params.set("pageSize", String(historyPagination.pageSize));
    return params.toString();
  }

  async function loadHistory() {
    const body = $("historyRows");
    try {
      const data = await docsApi(`?${buildHistoryQuery()}`);
      historyDocs = data.documents || [];
      historyPagination = data.pagination || historyPagination;
      renderHistory();
    } catch (error) {
      body.replaceChildren();
      const row = document.createElement("tr");
      addCell(row, error.message, "doc-empty");
      row.lastChild.colSpan = 6;
      body.append(row);
    }
  }

  function renderHistory() {
    const body = $("historyRows");
    body.replaceChildren();

    $("historyCount").textContent = historyPagination.total
      ? `${historyPagination.total} documento(s)`
      : "";
    $("paginationLabel").textContent = `Página ${historyPagination.page} de ${historyPagination.totalPages}`;
    $("prevPageButton").disabled = historyPagination.page <= 1;
    $("nextPageButton").disabled = historyPagination.page >= historyPagination.totalPages;

    if (!historyDocs.length) {
      const row = document.createElement("tr");
      const cell = addCell(
        row,
        "Nenhum documento cadastrado. Crie uma procuração, contrato, recibo ou autorização para começar.",
        "doc-empty",
      );
      cell.colSpan = 6;
      body.append(row);
      return;
    }

    historyDocs.forEach((doc) => {
      const row = document.createElement("tr");

      const info = addCell(row);
      info.append(
        createNode("strong", doc.title),
        createNode("small", TYPE_LABELS[doc.document_type] || doc.document_type),
      );

      addCell(row, text(doc.client_name, text(doc.participant_primary?.name)));

      addCell(
        row,
        doc.vehicle_brand
          ? `${doc.vehicle_brand} ${doc.vehicle_model} • ${doc.vehicle_year}`
          : text(doc.vehicle_snapshot?.label),
      );

      addCell(row, formatDate(doc.created_at));

      const statusCell = addCell(row);
      statusCell.append(
        createNode("span", STATUS_LABELS[doc.status] || doc.status, `doc-badge status-${doc.status}`),
      );

      const actions = addCell(row, "", "doc-row-actions");
      const openButton = createNode("button", "Abrir");
      openButton.type = "button";
      openButton.addEventListener("click", () => openDocumentForEdit(doc));

      const printButton = createNode("button", "Imprimir");
      printButton.type = "button";
      printButton.addEventListener("click", () => printDocumentRow(doc));

      const statusButton = createNode("button", "Status");
      statusButton.type = "button";
      statusButton.disabled = !(ALLOWED_TRANSITIONS[doc.status] || []).length;
      statusButton.addEventListener("click", () => openStatusDialog(doc));

      const deleteButton = createNode("button", "Excluir", "is-danger");
      deleteButton.type = "button";
      deleteButton.disabled = doc.status === "completed";
      deleteButton.addEventListener("click", () => deleteDocumentRow(doc));

      actions.append(openButton, printButton, statusButton, deleteButton);
      body.append(row);
    });
  }

  /* ==========================================
     PRÉ-PREENCHIMENTO A PARTIR DE UMA VENDA
  ========================================== */

  async function applySaleParam() {
    const params = new URLSearchParams(location.search);
    const saleId = params.get("saleId");
    if (!saleId) return;
    try {
      const { sale } = await api("/sales", `/${saleId}`);
      applyType("contrato_compra_venda");
      currentSaleId = sale.id;
      if (sale.customer_id) {
        $("clientSelect").value = String(sale.customer_id);
        onClientChange();
      }
      $("secondaryName").value = sale.buyer_name || "";
      $("secondaryDocument").value = "";
      $("vehicleSelect").value = sale.vehicle_id ? String(sale.vehicle_id) : "";
      renderVehicleSummary(buildVehicleSnapshot(getSelectedVehicle()));
      setMoneyValue($("operationValue"), sale.sale_price);
      $("paymentMethod").value = sale.payment_method || "";
      $("issueDate").value = (sale.sale_date || "").slice(0, 10);
      scheduleUpdate();
      showToast("Dados da venda carregados para o contrato.");
    } catch (error) {
      showMessage("pageMessage", `Não foi possível carregar a venda informada: ${error.message}`, true);
    }
  }

  /* ==========================================
     EVENTOS
  ========================================== */

  function bindEvents() {
    document.querySelectorAll("#documentTypeTabs .doc-tab").forEach((tab) => {
      tab.addEventListener("click", () => applyType(tab.dataset.type));
    });

    $("documentForm").addEventListener("input", scheduleUpdate);
    $("documentForm").addEventListener("change", scheduleUpdate);

    bindDocumentMask($("primaryDocument"));
    bindDocumentMask($("secondaryDocument"));
    bindMoneyMask($("operationValue"));

    $("vehicleSelect").addEventListener("change", onVehicleChange);
    $("clientSelect").addEventListener("change", onClientChange);

    $("newDocumentButton").addEventListener("click", newDocumentFlow);
    $("clearFormButton").addEventListener("click", async () => {
      const confirmed = await askConfirmation({
        title: "Limpar formulário?",
        message: "Os dados preenchidos serão perdidos.",
        confirmText: "Limpar",
      });
      if (confirmed) clearForm();
    });
    $("saveDraftButton").addEventListener("click", saveDraft);
    $("documentForm").addEventListener("submit", generateDocument);

    $("viewPreviewButton").addEventListener("click", openViewDialog);
    $("printPreviewButton").addEventListener("click", () => {
      scheduleUpdate();
      window.print();
    });
    $("viewDialogPrintButton").addEventListener("click", () => {
      $("viewDialog").close();
      scheduleUpdate();
      window.print();
    });

    $("statusForm").addEventListener("submit", submitStatusChange);
    $("statusSelect").addEventListener("change", () => {
      $("statusReasonWrapper").hidden = $("statusSelect").value !== "cancelled";
    });

    $("historyFilters").addEventListener("submit", (event) => {
      event.preventDefault();
      historyPagination.page = 1;
      loadHistory();
    });
    $("refreshHistoryButton").addEventListener("click", () => loadHistory());
    $("prevPageButton").addEventListener("click", () => {
      if (historyPagination.page > 1) {
        historyPagination.page -= 1;
        loadHistory();
      }
    });
    $("nextPageButton").addEventListener("click", () => {
      if (historyPagination.page < historyPagination.totalPages) {
        historyPagination.page += 1;
        loadHistory();
      }
    });

    bindDialogClosers();
  }

  /* ==========================================
     INICIALIZAÇÃO
  ========================================== */

  async function start() {
    bindEvents();

    const user = await requireAuth();
    if (!user) return;

    if (user.role !== "admin") {
      showMessage(
        "pageMessage",
        "A área de Documentação está disponível apenas para administradores.",
        true,
      );
      return;
    }
    currentUser = user;

    try {
      await Promise.all([loadVehicles(), loadCustomers(), loadSettings()]);
      applyType("procuracao");
      await Promise.all([loadSummary(), loadHistory()]);
      await applySaleParam();
    } catch (error) {
      showMessage("pageMessage", error.message, true);
    }
  }

  start().catch((error) => {
    console.error("Erro ao iniciar a área de Documentação:", error);
    showMessage(
      "pageMessage",
      "Não foi possível iniciar a área de Documentação. Atualize a página e tente novamente.",
      true,
    );
  });
})();
