const form = document.getElementById("vehicleForm");

const pageTitle = document.getElementById("pageTitle");
const submitButton = document.getElementById("submitButton");
const formMessage = document.getElementById("formMessage");

const financeSection = document.getElementById("vehicleFinanceSection");

const expenseForm = document.getElementById("expenseForm");

const expensesList = document.getElementById("expensesList");

let vehicleExpenses = [];

const coverImageInput = document.getElementById("coverImage");
const imagePreview = document.getElementById("imagePreview");

const generateCoverAIButton = document.getElementById("generateCoverAI");
const coverAIStatus = document.getElementById("coverAIStatus");
const coverAIChoice = document.getElementById("coverAIChoice");
const coverAIOriginalPreview = document.getElementById(
  "coverAIOriginalPreview",
);
const coverAIGeneratedPreview = document.getElementById(
  "coverAIGeneratedPreview",
);

// Capa gerada pela IA nesta sessão de edição (null enquanto não gerada)
let aiGeneratedCover = null;
let isGeneratingCover = false;

const galleryImagesInput = document.getElementById("galleryImages");
const galleryPreview = document.getElementById("galleryPreview");

const params = new URLSearchParams(window.location.search);

const vehicleId = params.get("id");
const isEditing = Boolean(vehicleId);
const vehicleSaleLink = document.getElementById("vehicleSaleLink");
if (vehicleSaleLink && vehicleId) vehicleSaleLink.href = `./sales.html?vehicle=${encodeURIComponent(vehicleId)}`;
const vehicleDispatcherLink = document.getElementById("vehicleDispatcherLink");
if (vehicleDispatcherLink && vehicleId) {
  vehicleDispatcherLink.href = `./despachante.html?vehicle=${encodeURIComponent(vehicleId)}`;
  vehicleDispatcherLink.hidden = false;
}

// Novas imagens selecionadas no computador
let selectedGalleryFiles = [];

// Imagens que já existem no banco ao editar
let existingGalleryImages = [];

/* =========================
   AUTENTICAÇÃO
========================= */

requireAuth().then((user) => {
  if (!user) {
    return;
  }

  applyRolePermissions(user);

  if (isEditing) {
    pageTitle.textContent = "Editar veículo";
    submitButton.textContent = "Salvar alterações";

    if (financeSection) {
      financeSection.hidden = false;
    }

    loadVehicle();
  }
});

/* =========================
   PERMISSÕES POR PAPEL

   Vendedor cadastra dados operacionais do veículo, mas não define
   preço de compra/venda nem cadastra diretamente como vendido — isso é
   feito pelo fluxo de Vendas. O backend já rejeita esses campos com
   403; aqui só ocultamos/desabilitamos a interface correspondente.
========================= */

function applyRolePermissions(user) {
  if (user.role !== "vendedor") {
    return;
  }

  document.getElementById("purchasePriceGroup")?.setAttribute("hidden", "");
  document.getElementById("salePriceGroup")?.setAttribute("hidden", "");

  const statusSelect = document.getElementById("status");

  if (statusSelect) {
    statusSelect.value = "available";
    statusSelect.disabled = true;
  }
}

/* =========================
   CARREGAR VEÍCULO
========================= */

async function loadVehicle() {
  try {
    const response = await fetch(`${API_URL}/vehicles/${vehicleId}`, {
      credentials: "include",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Veículo não encontrado.");
    }

    fillForm(data.vehicle);

    await loadGallery(vehicleId);
    await loadExpenses();
  } catch (error) {
    console.error(error);

    showMessage(error.message, "error");
  }
}

/* =========================
   CARREGAR GALERIA EXISTENTE
========================= */

async function loadGallery(id) {
  try {
    const response = await fetch(`${API_URL}/vehicle-images/${id}`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Erro ao carregar imagens.");
    }

    const data = await response.json();

    existingGalleryImages = data.images || [];

    renderGallery();
  } catch {
    console.error("Não foi possível carregar a galeria do veículo.");
  }
}

/* =========================
   PREENCHER FORMULÁRIO
========================= */

function fillForm(vehicle) {
  document.getElementById("brand").value = vehicle.brand || "";

  document.getElementById("model").value = vehicle.model || "";

  document.getElementById("year").value = vehicle.year || "";

  document.getElementById("manufacture_year").value =
    vehicle.manufacture_year || "";

  document.getElementById("price").value = vehicle.price || "";

  document.getElementById("purchase_price").value =
    vehicle.purchase_price ?? "";

  document.getElementById("entry_date").value = vehicle.entry_date
    ? vehicle.entry_date.split("T")[0]
    : "";

  document.getElementById("sale_price").value = vehicle.sale_price ?? "";

  document.getElementById("mileage").value = vehicle.mileage || "";

  document.getElementById("fuel").value = vehicle.fuel || "";

  document.getElementById("transmission").value = vehicle.transmission || "";

  document.getElementById("body_type").value = vehicle.body_type || "";

  document.getElementById("color").value = vehicle.color || "";

  document.getElementById("top_speed").value = vehicle.top_speed || "";

  document.getElementById("seats").value = vehicle.seats || "";

  document.getElementById("trunk_capacity").value =
    vehicle.trunk_capacity || "";

  document.getElementById("engine").value = vehicle.engine || "";

  document.getElementById("horsepower").value = vehicle.horsepower || "";

  document.getElementById("engine_displacement_cc").value =
    vehicle.engine_displacement_cc || "";

  document.getElementById("license_plate").value = vehicle.license_plate || "";

  document.getElementById("renavam").value = vehicle.renavam || "";

  document.getElementById("chassis_number").value =
    vehicle.chassis_number || "";

  document.getElementById("document_vehicle_type").value =
    vehicle.document_vehicle_type || "";

  document.getElementById("document_species").value =
    vehicle.document_species || "";

  document.getElementById("document_category").value =
    vehicle.document_category || "";

  document.getElementById("description").value = vehicle.description || "";

  document.getElementById("status").value = vehicle.status || "available";

  /*
        Se o veículo já possui uma imagem,
        mostramos ela ao editar.
    */

  if (vehicle.image_url) {
    imagePreview.innerHTML = `
            <img
                src="${vehicle.image_url}"
                alt="Imagem atual do veículo"
            >

            <span class="image-current-label">
                Imagem atual
            </span>
        `;
  }
}

/* =========================
   IMAGEM PRINCIPAL
========================= */

coverImageInput.addEventListener("change", () => {
  const file = coverImageInput.files[0];

  // Uma nova foto invalida a capa gerada pela IA para a foto anterior.
  resetAiCoverState();

  if (!file) {
    imagePreview.innerHTML = `
                <span>
                    A prévia da imagem aparecerá aqui
                </span>
            `;

    return;
  }

  if (!isValidImage(file)) {
    coverImageInput.value = "";

    showMessage("Selecione uma imagem JPG, PNG ou WEBP.", "error");

    return;
  }

  const previewUrl = URL.createObjectURL(file);

  imagePreview.innerHTML = `
            <img
                src="${previewUrl}"
                alt="Prévia do veículo"
            >
        `;
});

/* ==========================================
   GERAR CAPA PROFISSIONAL COM IA
========================================== */

function resetAiCoverState() {
  aiGeneratedCover = null;

  if (coverAIChoice) {
    coverAIChoice.hidden = true;
  }

  if (coverAIStatus) {
    coverAIStatus.textContent = "";
    coverAIStatus.className = "description-ai-status";
  }
}

generateCoverAIButton?.addEventListener("click", generateVehicleCoverAI);

async function generateVehicleCoverAI() {
  if (isGeneratingCover) {
    return;
  }

  const file = coverImageInput.files[0];

  if (!file) {
    coverAIStatus.textContent =
      "Selecione a foto real do veículo antes de gerar a capa.";
    coverAIStatus.className = "description-ai-status error";

    return;
  }

  if (!isValidImage(file)) {
    coverAIStatus.textContent = "Selecione uma imagem JPG, PNG ou WEBP.";
    coverAIStatus.className = "description-ai-status error";

    return;
  }

  const MAX_SIZE = 5 * 1024 * 1024;

  if (file.size > MAX_SIZE) {
    coverAIStatus.textContent = "A imagem deve ter no máximo 5MB.";
    coverAIStatus.className = "description-ai-status error";

    return;
  }

  const style =
    document.querySelector('input[name="aiCoverStyle"]:checked')?.value ||
    "white";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    isGeneratingCover = true;

    generateCoverAIButton.disabled = true;
    generateCoverAIButton.innerHTML = "<span>✦</span> Gerando capa...";

    coverAIStatus.textContent =
      "A IA está gerando a capa profissional... isso pode levar até 1 minuto.";
    coverAIStatus.className = "description-ai-status";

    if (coverAIChoice) {
      coverAIChoice.hidden = true;
    }

    const coverFormData = new FormData();
    coverFormData.append("photo", file);
    coverFormData.append("style", style);

    const response = await fetch(`${API_URL}/ai/vehicle-cover`, {
      method: "POST",
      credentials: "include",
      body: coverFormData,
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível gerar a capa com IA.");
    }

    aiGeneratedCover = {
      url: data.image_url,
      publicId: data.public_id,
      style: data.style,
    };

    coverAIOriginalPreview.src = URL.createObjectURL(file);
    coverAIGeneratedPreview.src = data.image_url;

    const aiChoiceRadio = document.querySelector(
      'input[name="coverChoice"][value="ai"]',
    );

    if (aiChoiceRadio) {
      aiChoiceRadio.checked = true;
    }

    if (coverAIChoice) {
      coverAIChoice.hidden = false;
    }

    coverAIStatus.textContent =
      "Capa gerada com sucesso. Escolha qual imagem deseja usar abaixo.";
    coverAIStatus.className = "description-ai-status success";
  } catch (error) {
    console.error("Erro ao gerar capa com IA:", error);

    coverAIStatus.textContent =
      error.name === "AbortError"
        ? "Tempo esgotado ao gerar a imagem. Tente novamente."
        : error.message;
    coverAIStatus.className = "description-ai-status error";
  } finally {
    clearTimeout(timeoutId);

    isGeneratingCover = false;

    generateCoverAIButton.disabled = false;
    generateCoverAIButton.innerHTML =
      "<span>✦</span> Gerar capa profissional com IA";
  }
}

/* =========================
   GALERIA
========================= */

galleryImagesInput.addEventListener("change", () => {
  const files = Array.from(galleryImagesInput.files);

  const validFiles = files.filter(isValidImage);

  if (validFiles.length !== files.length) {
    showMessage(
      "Alguns arquivos foram ignorados. Use somente JPG, PNG ou WEBP.",
      "error",
    );
  }

  /*
            Adicionamos os arquivos selecionados
            à galeria.
        */

  selectedGalleryFiles.push(...validFiles);

  /*
            Limpamos o input para permitir
            selecionar novamente o mesmo arquivo.
        */

  galleryImagesInput.value = "";

  renderGallery();
});

/* =========================
   RENDERIZAR GALERIA
========================= */

function renderGallery() {
  const hasExisting = existingGalleryImages.length > 0;

  const hasNew = selectedGalleryFiles.length > 0;

  if (!hasExisting && !hasNew) {
    galleryPreview.innerHTML = `
            <p>
                Nenhuma foto selecionada.
            </p>
        `;

    return;
  }

  /*
        Imagens que já existem no servidor.
    */

  const existingHTML = existingGalleryImages
    .map((image, index) => {
      return `
                    <div class="gallery-item">

                        <img
                            src="${image.image_url}"
                            alt="Foto existente ${index + 1}"
                        >

                        <span class="gallery-existing-label">
                            Salva
                        </span>

                    </div>
                `;
    })
    .join("");

  /*
        Novos arquivos escolhidos no computador.
    */

  const newHTML = selectedGalleryFiles
    .map((file, index) => {
      const previewUrl = URL.createObjectURL(file);

      return `
                    <div class="gallery-item">

                        <img
                            src="${previewUrl}"
                            alt="${file.name}"
                        >

                        <button
                            type="button"
                            class="gallery-remove"
                            data-index="${index}"
                        >
                            ×
                        </button>

                    </div>
                `;
    })
    .join("");

  galleryPreview.innerHTML = existingHTML + newHTML;

  document.querySelectorAll(".gallery-remove").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);

      selectedGalleryFiles.splice(index, 1);

      renderGallery();
    });
  });
}

/* =========================
   SALVAR VEÍCULO
========================= */

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearMessage();

  const brand = document.getElementById("brand").value.trim();

  const model = document.getElementById("model").value.trim();

  const year = document.getElementById("year").value;

  const price = document.getElementById("price").value;

  if (!brand || !model || !year || !price) {
    showMessage("Preencha marca, modelo, ano e preço.", "error");

    return;
  }

  /*
            Criamos FormData.

            Agora NÃO usamos JSON.stringify().
        */

  const formData = new FormData();

  const purchasePrice = document.getElementById("purchase_price").value;

  if (purchasePrice) {
    formData.append("purchase_price", purchasePrice);
  }

  const entryDate = document.getElementById("entry_date").value;

  if (entryDate) {
    formData.append("entry_date", entryDate);
  }

  const salePrice = document.getElementById("sale_price").value;

  if (salePrice) {
    formData.append("sale_price", salePrice);
  }

  formData.append("brand", brand);

  formData.append("model", model);

  formData.append("year", year);

  const manufactureYear = document.getElementById("manufacture_year").value;

  if (manufactureYear) {
    formData.append("manufacture_year", manufactureYear);
  }

  formData.append("price", price);

  const mileage = document.getElementById("mileage").value;

  if (mileage) {
    formData.append("mileage", mileage);
  }

  const fuel = document.getElementById("fuel").value;

  if (fuel) {
    formData.append("fuel", fuel);
  }

  const transmission = document.getElementById("transmission").value;

  if (transmission) {
    formData.append("transmission", transmission);
  }

  const bodyType = document.getElementById("body_type").value;

  if (bodyType) {
    formData.append("body_type", bodyType);
  }

  const color = document.getElementById("color").value.trim();

  if (color) {
    formData.append("color", color);
  }

  const topSpeed = document.getElementById("top_speed").value;

  if (topSpeed) {
    formData.append("top_speed", topSpeed);
  }

  const seats = document.getElementById("seats").value;

  if (seats) {
    formData.append("seats", seats);
  }

  const trunkCapacity = document.getElementById("trunk_capacity").value;

  if (trunkCapacity) {
    formData.append("trunk_capacity", trunkCapacity);
  }

  const engine = document.getElementById("engine").value.trim();

  if (engine) {
    formData.append("engine", engine);
  }

  const horsepower = document.getElementById("horsepower").value;

  if (horsepower) {
    formData.append("horsepower", horsepower);
  }

  const engineDisplacementCc = document.getElementById(
    "engine_displacement_cc",
  ).value;

  if (engineDisplacementCc) {
    formData.append("engine_displacement_cc", engineDisplacementCc);
  }

  const licensePlate = document
    .getElementById("license_plate")
    .value.trim()
    .toUpperCase();

  if (licensePlate) {
    formData.append("license_plate", licensePlate);
  }

  const renavam = document.getElementById("renavam").value.trim();

  if (renavam) {
    formData.append("renavam", renavam);
  }

  const chassisNumber = document
    .getElementById("chassis_number")
    .value.trim()
    .toUpperCase();

  if (chassisNumber) {
    formData.append("chassis_number", chassisNumber);
  }

  const documentVehicleType = document
    .getElementById("document_vehicle_type")
    .value.trim();

  if (documentVehicleType) {
    formData.append("document_vehicle_type", documentVehicleType);
  }

  const documentSpecies = document
    .getElementById("document_species")
    .value.trim();

  if (documentSpecies) {
    formData.append("document_species", documentSpecies);
  }

  const documentCategory = document
    .getElementById("document_category")
    .value.trim();

  if (documentCategory) {
    formData.append("document_category", documentCategory);
  }

  const description = document.getElementById("description").value.trim();

  if (description) {
    formData.append("description", description);
  }

  formData.append("status", document.getElementById("status").value);

  /*
            IMAGEM PRINCIPAL
        */

  const coverImage = coverImageInput.files[0];

  const coverChoice = document.querySelector(
    'input[name="coverChoice"]:checked',
  )?.value;

  if (aiGeneratedCover && coverChoice === "ai") {
    formData.append("ai_cover_public_id", aiGeneratedCover.publicId);
    formData.append("ai_cover_url", aiGeneratedCover.url);
  } else if (coverImage) {
    formData.append("coverImage", coverImage);
  }

  /*
            GALERIA
        */

  selectedGalleryFiles.forEach((file) => {
    formData.append("galleryImages", file);
  });

  submitButton.disabled = true;

  submitButton.textContent = "Salvando...";

  try {
    const url = isEditing
      ? `${API_URL}/vehicles/${vehicleId}`
      : `${API_URL}/vehicles`;

    const method = isEditing ? "PUT" : "POST";

    const response = await fetch(url, {
      method,

      credentials: "include",

      /*
                            IMPORTANTE:

                            NÃO colocar:

                            Content-Type:
                            application/json
                        */

      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erro ao salvar veículo.");
    }

    showMessage(
      isEditing
        ? "Veículo atualizado com sucesso!"
        : "Veículo cadastrado com sucesso!",

      "success",
    );

    setTimeout(() => {
      window.location.href = "./vehicles.html";
    }, 800);
  } catch (error) {
    console.error(error);

    showMessage(error.message, "error");
  } finally {
    submitButton.disabled = false;

    submitButton.textContent = isEditing
      ? "Salvar alterações"
      : "Salvar veículo";
  }
});

/* =========================
   DESPESAS DO VEÍCULO
========================= */

async function loadExpenses() {
  if (!vehicleId || !expensesList) {
    return;
  }

  try {
    const response = await fetch(
      `${API_URL}/vehicle-expenses/vehicle/${vehicleId}`,
      {
        credentials: "include",
      },
    );

    const data = await response.json();

    console.log("GET despesas:", response.status, data);

    if (!response.ok) {
      throw new Error(data.error || "Erro ao carregar despesas.");
    }

    vehicleExpenses = data.expenses || [];

    renderExpenses();
    updateFinanceSummary();
  } catch (error) {
    console.error("Erro ao carregar despesas:", error);

    expensesList.innerHTML = `
      <p class="error">
        Não foi possível carregar as despesas.
      </p>
    `;
  }
}

/* =========================
   CADASTRAR DESPESA
========================= */

if (expenseForm) {
  expenseForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const category = document.getElementById("expenseCategory").value;

    const amount = document.getElementById("expenseAmount").value;

    const expenseDate = document.getElementById("expenseDate").value;

    const description = document
      .getElementById("expenseDescription")
      .value.trim();

    if (!category || !amount) {
      showMessage("Informe a categoria e o valor da despesa.", "error");
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/vehicle-expenses/vehicle/${vehicleId}`,
        {
          method: "POST",

          credentials: "include",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            category,
            amount: Number(amount),
            expense_date: expenseDate || null,
            description: description || null,
          }),
        },
      );

      const data = await response.json();

      console.log("POST despesa:", response.status, data);

      if (!response.ok) {
        throw new Error(data.error || "Erro ao cadastrar despesa.");
      }

      // Atualiza primeiro
      await loadExpenses();

      // Limpa somente depois do sucesso
      expenseForm.reset();

      showMessage("Despesa adicionada com sucesso!", "success");
    } catch (error) {
      console.error("Erro ao cadastrar despesa:", error);

      showMessage(error.message, "error");
    }
  });
}

/* =========================
   RENDERIZAR DESPESAS
========================= */

function renderExpenses() {
  if (!expensesList) {
    return;
  }

  if (vehicleExpenses.length === 0) {
    expensesList.innerHTML = `
      <p>Nenhuma despesa cadastrada.</p>
    `;

    return;
  }

  expensesList.innerHTML = vehicleExpenses
    .map((expense) => {
      const amount = Number(expense.amount || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

      const date = expense.expense_date
        ? new Date(expense.expense_date).toLocaleDateString("pt-BR")
        : "Sem data";

      return `
        <div class="expense-item">

          <div class="expense-info">

            <strong>
              ${expense.category || "Despesa"}
            </strong>

            <span>
              ${expense.description || ""}
            </span>

            <small>
              ${date}
            </small>

          </div>

          <strong class="expense-value">
            ${amount}
          </strong>

        </div>
      `;
    })
    .join("");
}

/* =========================
   RESUMO FINANCEIRO
========================= */

function updateFinanceSummary() {
  const purchasePrice = Number(
    document.getElementById("purchase_price")?.value || 0,
  );

  const advertisedPrice = Number(document.getElementById("price")?.value || 0);

  const salePrice = Number(document.getElementById("sale_price")?.value || 0);

  const totalExpenses = vehicleExpenses.reduce((total, expense) => {
    return total + Number(expense.amount || 0);
  }, 0);

  const totalCost = purchasePrice + totalExpenses;

  const potentialProfit = advertisedPrice - totalCost;

  const realProfit = salePrice > 0 ? salePrice - totalCost : null;

  const margin = totalCost > 0 ? (potentialProfit / totalCost) * 100 : 0;

  const purchaseElement = document.getElementById("financePurchasePrice");

  const expensesElement = document.getElementById("financeExpenses");

  const totalCostElement = document.getElementById("financeTotalCost");

  const advertisedElement = document.getElementById("financeAdvertisedPrice");

  const profitElement = document.getElementById("financePotentialProfit");

  const marginElement = document.getElementById("financeMargin");

  if (purchaseElement) {
    purchaseElement.textContent = formatCurrency(purchasePrice);
  }

  if (expensesElement) {
    expensesElement.textContent = formatCurrency(totalExpenses);
  }

  if (totalCostElement) {
    totalCostElement.textContent = formatCurrency(totalCost);
  }

  if (advertisedElement) {
    advertisedElement.textContent = formatCurrency(advertisedPrice);
  }

  if (profitElement) {
    profitElement.textContent = formatCurrency(potentialProfit);
  }

  if (marginElement) {
    marginElement.textContent = `${margin.toFixed(2)}%`;
  }

  console.log({
    purchasePrice,
    totalExpenses,
    totalCost,
    advertisedPrice,
    potentialProfit,
    salePrice,
    realProfit,
    margin,
  });
}

document
  .getElementById("purchase_price")
  ?.addEventListener("input", updateFinanceSummary);

document
  .getElementById("price")
  ?.addEventListener("input", updateFinanceSummary);

document
  .getElementById("sale_price")
  ?.addEventListener("input", updateFinanceSummary);

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/* =========================
   VALIDAÇÃO DE IMAGEM
========================= */

function isValidImage(file) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  return allowedTypes.includes(file.type);
}

/* =========================
   MENSAGENS
========================= */

function showMessage(message, type) {
  formMessage.textContent = message;

  formMessage.className = `form-message ${type}`;
}

function clearMessage() {
  formMessage.textContent = "";

  formMessage.className = "form-message";
}

/* ==========================================
   GERAR DESCRIÇÃO COM IA
========================================== */

const generateDescriptionAI = document.getElementById("generateDescriptionAI");

const descriptionAIStatus = document.getElementById("descriptionAIStatus");

generateDescriptionAI?.addEventListener("click", generateVehicleDescription);

async function generateVehicleDescription() {
  const brand = document.getElementById("brand")?.value.trim();

  const model = document.getElementById("model")?.value.trim();

  const year = document.getElementById("year")?.value;

  const mileage = document.getElementById("mileage")?.value;

  const fuel = document.getElementById("fuel")?.value;

  const transmission = document.getElementById("transmission")?.value;

  const color = document.getElementById("color")?.value.trim();

  const price = document.getElementById("price")?.value;

  const description = document.getElementById("description");

  if (!brand || !model) {
    descriptionAIStatus.textContent = "Preencha pelo menos a marca e o modelo.";

    descriptionAIStatus.className = "description-ai-status error";

    return;
  }

  try {
    generateDescriptionAI.disabled = true;

    generateDescriptionAI.innerHTML = "<span>✦</span> Gerando...";

    descriptionAIStatus.textContent =
      "A IA está preparando a descrição do veículo...";

    descriptionAIStatus.className = "description-ai-status";

    const response = await fetch(`${API_URL}/ai/vehicle-description`, {
      method: "POST",

      credentials: "include",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        brand,
        model,
        year,
        mileage,
        fuel,
        transmission,
        color,
        price,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível gerar a descrição.");
    }

    description.value = data.description;

    descriptionAIStatus.textContent =
      "Descrição gerada. Você pode editar antes de salvar.";

    descriptionAIStatus.className = "description-ai-status success";

    description.focus();
  } catch (error) {
    console.error("Erro ao gerar descrição:", error);

    descriptionAIStatus.textContent = error.message;

    descriptionAIStatus.className = "description-ai-status error";
  } finally {
    generateDescriptionAI.disabled = false;

    generateDescriptionAI.innerHTML = "<span>✦</span> Gerar novamente";
  }
}

/* ==========================================
   BUSCAR ESPECIFICAÇÕES TÉCNICAS COM IA
========================================== */

const generateSpecsAI = document.getElementById("generateSpecsAI");

const specsAIStatus = document.getElementById("specsAIStatus");

generateSpecsAI?.addEventListener("click", () =>
  generateVehicleSpecs({ overwrite: true }),
);

// Campos que a IA de especificações pode preencher no formulário.
const SPECS_FIELD_MAP = {
  velocidade_maxima_kmh: "top_speed",
  capacidade_passageiros: "seats",
  capacidade_porta_malas_litros: "trunk_capacity",
  combustivel: "fuel",
  cambio: "transmission",
  motorizacao: "engine",
  potencia_cv: "horsepower",
};

/*
  Busca as especificações técnicas na IA. Quando o formulário já tem
  cilindrada/potência (preenchidas manualmente ou lidas do CRLV), elas
  são enviadas como pista para a IA identificar a motorização exata.
*/
async function fetchVehicleSpecsFromAI({ brand, model, year, version, engine }) {
  const engineDisplacementCc = document.getElementById(
    "engine_displacement_cc",
  )?.value;

  const horsepower = document.getElementById("horsepower")?.value;

  const response = await fetch(`${API_URL}/ai/vehicle-specs`, {
    method: "POST",

    credentials: "include",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      brand,
      model,
      year,
      version,
      engine,
      engine_displacement_cc: engineDisplacementCc || undefined,
      horsepower: horsepower || undefined,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Não foi possível buscar as especificações.",
    );
  }

  return data;
}

/*
  Aplica o resultado da IA de especificações aos campos do formulário.
  overwrite=true (botão manual): é uma ação explícita do admin/vendedor,
  pode substituir valores já preenchidos.
  overwrite=false (disparo automático após aplicar o CRLV): só preenche
  campos vazios — nunca substitui um dado que já veio do próprio CRLV
  (ex.: potência, combustível).
*/
function applySpecsFields(data, { overwrite }) {
  let filledCount = 0;

  Object.entries(SPECS_FIELD_MAP).forEach(([aiField, formFieldId]) => {
    const value = data[aiField];

    if (value === null || value === undefined || value === "") {
      return;
    }

    const input = document.getElementById(formFieldId);

    if (!input || input.disabled) {
      return;
    }

    if (!overwrite && String(input.value || "").trim() !== "") {
      return;
    }

    input.value = value;

    filledCount += 1;
  });

  return filledCount;
}

async function generateVehicleSpecs({ overwrite }) {
  const brand = document.getElementById("brand")?.value.trim();

  const model = document.getElementById("model")?.value.trim();

  const year = document.getElementById("year")?.value;

  const version = document.getElementById("specsVersion")?.value.trim();

  const engine = document.getElementById("engine")?.value.trim();

  if (!brand || !model || !year) {
    specsAIStatus.textContent = "Preencha marca, modelo e ano do veículo.";

    specsAIStatus.className = "description-ai-status error";

    return;
  }

  try {
    generateSpecsAI.disabled = true;

    generateSpecsAI.innerHTML = "<span>✦</span> Buscando...";

    specsAIStatus.textContent =
      "A IA está buscando as especificações do veículo...";

    specsAIStatus.className = "description-ai-status";

    const data = await fetchVehicleSpecsFromAI({
      brand,
      model,
      year,
      version,
      engine,
    });

    /*
      Preenchemos somente os campos que a IA devolveu com segurança
      (diferentes de null). Campos já preenchidos manualmente podem
      ser sobrescritos aqui — é uma ação explícita do admin, que ainda
      pode editar tudo antes de salvar.
    */

    const filledCount = applySpecsFields(data, { overwrite });

    const messageParts = [];

    if (filledCount > 0) {
      messageParts.push(
        `${filledCount} campo(s) preenchido(s) (confiança: ${data.confianca}).`,
      );
    } else {
      messageParts.push(
        "A IA não encontrou dados confiáveis para preencher automaticamente.",
      );
    }

    if (data.observacao) {
      messageParts.push(data.observacao);
    }

    specsAIStatus.textContent = messageParts.join(" ");

    specsAIStatus.className =
      filledCount > 0 && data.confianca === "alta"
        ? "description-ai-status success"
        : "description-ai-status warning";
  } catch (error) {
    console.error("Erro ao buscar especificações:", error);

    specsAIStatus.textContent = error.message;

    specsAIStatus.className = "description-ai-status error";
  } finally {
    generateSpecsAI.disabled = false;

    generateSpecsAI.innerHTML = "<span>✦</span> Buscar novamente";
  }
}

/*
  Disparo automático após aplicar os dados do CRLV: usa marca/modelo/ano
  já aplicados no formulário (e a cilindrada/potência lidas do próprio
  CRLV) para buscar o motor exato e preencher velocidade máxima,
  passageiros, porta-malas e câmbio — só em campos ainda vazios. Falha
  nesta busca é silenciosa (best-effort): a leitura do CRLV já foi
  concluída com sucesso independentemente disso.
*/
async function autoFillSpecsFromCrlv() {
  const brand = document.getElementById("brand")?.value.trim();
  const model = document.getElementById("model")?.value.trim();
  const year = document.getElementById("year")?.value;

  if (!brand || !model || !year) {
    return null;
  }

  const version = document.getElementById("specsVersion")?.value.trim();
  const engine = document.getElementById("engine")?.value.trim();

  if (generateSpecsAI) {
    generateSpecsAI.disabled = true;
    generateSpecsAI.innerHTML = "<span>✦</span> Buscando...";
  }

  if (specsAIStatus) {
    specsAIStatus.textContent =
      "Buscando o motor e os detalhes técnicos com base no CRLV...";
    specsAIStatus.className = "description-ai-status";
  }

  try {
    const data = await fetchVehicleSpecsFromAI({
      brand,
      model,
      year,
      version,
      engine,
    });

    const filledCount = applySpecsFields(data, { overwrite: false });

    if (specsAIStatus) {
      const messageParts = [
        filledCount > 0
          ? `${filledCount} detalhe(s) técnico(s) preenchido(s) a partir do CRLV (confiança: ${data.confianca}).`
          : "A IA não encontrou detalhes técnicos confiáveis para preencher automaticamente.",
      ];

      if (data.observacao) {
        messageParts.push(data.observacao);
      }

      specsAIStatus.textContent = messageParts.join(" ");
      specsAIStatus.className =
        filledCount > 0 && data.confianca === "alta"
          ? "description-ai-status success"
          : "description-ai-status warning";
    }

    return { filledCount, data };
  } catch (error) {
    console.error("Erro ao buscar motor/detalhes técnicos a partir do CRLV:", error);

    if (specsAIStatus) {
      specsAIStatus.textContent =
        "Não foi possível buscar o motor e os detalhes técnicos automaticamente. Você pode tentar de novo abaixo.";
      specsAIStatus.className = "description-ai-status warning";
    }

    return null;
  } finally {
    if (generateSpecsAI) {
      generateSpecsAI.disabled = false;
      generateSpecsAI.innerHTML = "<span>✦</span> Buscar novamente";
    }
  }
}

/* ==========================================
   IMPORTAR CRLV

   Só lê o documento e prepara os dados para revisão — em nenhuma
   hipótese isso envia o formulário. O usuário decide o que aplicar e
   ainda precisa clicar em "Salvar veículo" para cadastrar de fato.
========================================== */

const crlvDropzone = document.getElementById("crlvDropzone");
const crlvFileInput = document.getElementById("crlvFileInput");
const crlvFileInfo = document.getElementById("crlvFileInfo");
const crlvFileName = document.getElementById("crlvFileName");
const crlvFileSize = document.getElementById("crlvFileSize");
const crlvRemoveFile = document.getElementById("crlvRemoveFile");
const crlvReadButton = document.getElementById("crlvReadButton");
const crlvCancelButton = document.getElementById("crlvCancelButton");
const crlvLoading = document.getElementById("crlvLoading");
const crlvError = document.getElementById("crlvError");
const crlvReviewPanel = document.getElementById("crlvReviewPanel");
const crlvDuplicateWarning = document.getElementById("crlvDuplicateWarning");
const crlvWarningsList = document.getElementById("crlvWarningsList");
const crlvFieldsList = document.getElementById("crlvFieldsList");
const crlvApplyButton = document.getElementById("crlvApplyButton");
const crlvCancelReviewButton = document.getElementById(
  "crlvCancelReviewButton",
);

const CRLV_MAX_SIZE = 10 * 1024 * 1024;
const CRLV_ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const CRLV_READ_TIMEOUT_MS = 30000;

const CRLV_CONFIDENCE_LABELS = {
  alta: "Alta confiança",
  media: "Média confiança",
  baixa: "Baixa confiança",
};

const CRLV_FIELD_LABELS = {
  license_plate: "Placa",
  renavam: "RENAVAM",
  chassis_number: "Chassi",
};

// Ordem de exibição no painel de revisão + mapeamento para os campos
// já existentes no formulário.
const CRLV_FIELD_MAP = [
  { key: "brand", label: "Marca", inputId: "brand" },
  { key: "model", label: "Modelo", inputId: "model" },
  { key: "model_year", label: "Ano do modelo", inputId: "year" },
  {
    key: "manufacture_year",
    label: "Ano de fabricação",
    inputId: "manufacture_year",
  },
  { key: "color", label: "Cor", inputId: "color" },
  { key: "fuel", label: "Combustível", inputId: "fuel" },
  { key: "license_plate", label: "Placa", inputId: "license_plate" },
  { key: "renavam", label: "RENAVAM", inputId: "renavam" },
  { key: "chassis_number", label: "Chassi", inputId: "chassis_number" },
  {
    key: "vehicle_type",
    label: "Tipo (documento)",
    inputId: "document_vehicle_type",
  },
  { key: "species", label: "Espécie (documento)", inputId: "document_species" },
  {
    key: "category",
    label: "Categoria (documento)",
    inputId: "document_category",
  },
  {
    key: "engine_displacement_cc",
    label: "Cilindrada (cm³)",
    inputId: "engine_displacement_cc",
  },
  { key: "horsepower", label: "Potência (cv)", inputId: "horsepower" },
];

let selectedCrlvFile = null;
let crlvReviewData = null;

function isValidCrlvFile(file) {
  return CRLV_ALLOWED_TYPES.includes(file.type);
}

function formatCrlvFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showCrlvError(message) {
  crlvError.textContent = message;
  crlvError.hidden = false;
}

function selectCrlvFile(file) {
  if (!file) {
    return;
  }

  if (!isValidCrlvFile(file)) {
    showCrlvError("Envie um CRLV em PDF, JPG ou PNG.");
    return;
  }

  if (file.size > CRLV_MAX_SIZE) {
    showCrlvError("O arquivo deve ter no máximo 10 MB.");
    return;
  }

  selectedCrlvFile = file;
  crlvReviewData = null;

  crlvError.hidden = true;
  crlvReviewPanel.hidden = true;

  crlvFileName.textContent = file.name;
  crlvFileSize.textContent = formatCrlvFileSize(file.size);
  crlvFileInfo.hidden = false;
  crlvDropzone.hidden = true;

  crlvReadButton.disabled = false;
  crlvCancelButton.hidden = false;
}

function resetCrlvState() {
  selectedCrlvFile = null;
  crlvReviewData = null;

  crlvFileInput.value = "";
  crlvFileInfo.hidden = true;
  crlvDropzone.hidden = false;

  crlvReviewPanel.hidden = true;
  crlvError.hidden = true;
  crlvLoading.hidden = true;

  crlvReadButton.disabled = true;
  crlvCancelButton.hidden = true;
}

crlvDropzone?.addEventListener("click", () => crlvFileInput.click());

crlvDropzone?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    crlvFileInput.click();
  }
});

crlvDropzone?.addEventListener("dragover", (event) => {
  event.preventDefault();
  crlvDropzone.classList.add("dragover");
});

crlvDropzone?.addEventListener("dragleave", () => {
  crlvDropzone.classList.remove("dragover");
});

crlvDropzone?.addEventListener("drop", (event) => {
  event.preventDefault();
  crlvDropzone.classList.remove("dragover");
  selectCrlvFile(event.dataTransfer?.files?.[0]);
});

crlvFileInput?.addEventListener("change", () => {
  selectCrlvFile(crlvFileInput.files?.[0]);
});

crlvRemoveFile?.addEventListener("click", resetCrlvState);
crlvCancelButton?.addEventListener("click", resetCrlvState);
crlvCancelReviewButton?.addEventListener("click", resetCrlvState);

function mapCrlvErrorMessage(status, data) {
  const fallbackByStatus = {
    400: "Envie um CRLV em PDF, JPG ou PNG.",
    401: "Sua sessão expirou. Faça login novamente.",
    403: "Você não tem permissão para ler o CRLV.",
    413: "O arquivo deve ter no máximo 10 MB.",
    415: "Envie um CRLV em PDF, JPG ou PNG.",
    422: "O arquivo não parece ser um CRLV válido ou legível.",
    429: "Muitas leituras em pouco tempo. Aguarde alguns minutos.",
    502: "Não foi possível ler o documento agora. Tente novamente em instantes.",
    503: "Leitura de CRLV indisponível no momento.",
    504: "A leitura demorou demais. Tente novamente.",
  };

  return data?.error || fallbackByStatus[status] || "Não foi possível ler o CRLV.";
}

crlvReadButton?.addEventListener("click", async () => {
  if (!selectedCrlvFile) {
    return;
  }

  crlvError.hidden = true;
  crlvReviewPanel.hidden = true;
  crlvLoading.hidden = false;

  crlvReadButton.disabled = true;
  crlvCancelButton.hidden = true;

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CRLV_READ_TIMEOUT_MS,
  );

  try {
    const crlvFormData = new FormData();
    crlvFormData.append("crlv", selectedCrlvFile);

    const response = await fetch(`${API_URL}/vehicles/import-crlv`, {
      method: "POST",
      credentials: "include",
      body: crlvFormData,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(mapCrlvErrorMessage(response.status, data));
    }

    renderCrlvReview(data);
  } catch (error) {
    console.error("Erro ao ler CRLV:", error);

    showCrlvError(
      error.name === "AbortError"
        ? "Tempo esgotado ao ler o documento. Tente novamente."
        : error.message,
    );

    crlvCancelButton.hidden = false;
  } finally {
    clearTimeout(timeoutId);

    crlvLoading.hidden = true;
    crlvReadButton.disabled = false;
  }
});

function renderCrlvReview(result) {
  crlvReviewData = result;

  const data = result.data || {};
  const confidence = result.confidence || {};
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const duplicates = Array.isArray(result.duplicates) ? result.duplicates : [];

  crlvFieldsList.innerHTML = "";

  CRLV_FIELD_MAP.forEach((field) => {
    const value = data[field.key];

    if (value === null || value === undefined || value === "") {
      return;
    }

    const row = document.createElement("div");
    row.className = "crlv-field-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.id = `crlvField_${field.key}`;
    checkbox.dataset.fieldKey = field.key;

    const textWrap = document.createElement("div");
    textWrap.className = "crlv-field-text";

    const labelEl = document.createElement("label");
    labelEl.setAttribute("for", checkbox.id);
    labelEl.textContent = field.label;

    const valueEl = document.createElement("span");
    valueEl.className = "crlv-field-value";
    valueEl.textContent = String(value);

    textWrap.appendChild(labelEl);
    textWrap.appendChild(valueEl);

    const confidenceLevel = confidence[field.key] || "baixa";

    const confidenceEl = document.createElement("span");
    confidenceEl.className = `crlv-field-confidence crlv-confidence-${confidenceLevel}`;
    confidenceEl.textContent =
      CRLV_CONFIDENCE_LABELS[confidenceLevel] || confidenceLevel;

    row.appendChild(checkbox);
    row.appendChild(textWrap);
    row.appendChild(confidenceEl);

    crlvFieldsList.appendChild(row);
  });

  crlvWarningsList.innerHTML = "";

  if (warnings.length > 0) {
    warnings.forEach((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      crlvWarningsList.appendChild(item);
    });

    crlvWarningsList.hidden = false;
  } else {
    crlvWarningsList.hidden = true;
  }

  crlvDuplicateWarning.innerHTML = "";

  if (duplicates.length > 0) {
    const title = document.createElement("strong");
    title.textContent = "Possível duplicidade encontrada: ";
    crlvDuplicateWarning.appendChild(title);

    duplicates.forEach((duplicate, index) => {
      const fieldLabel =
        CRLV_FIELD_LABELS[duplicate.field] || duplicate.field;

      const text = document.createElement("span");
      text.textContent = `${fieldLabel} já cadastrada no veículo #${duplicate.vehicle_id} (${duplicate.vehicle_label})${
        index < duplicates.length - 1 ? "; " : "."
      }`;

      crlvDuplicateWarning.appendChild(text);
    });

    crlvDuplicateWarning.hidden = false;
  } else {
    crlvDuplicateWarning.hidden = true;
  }

  crlvReviewPanel.hidden = false;
  crlvCancelButton.hidden = false;
}

crlvApplyButton?.addEventListener("click", () => {
  if (!crlvReviewData) {
    return;
  }

  const checkboxes = crlvFieldsList.querySelectorAll('input[type="checkbox"]');

  let appliedCount = 0;

  checkboxes.forEach((checkbox) => {
    if (!checkbox.checked) {
      return;
    }

    const fieldConfig = CRLV_FIELD_MAP.find(
      (field) => field.key === checkbox.dataset.fieldKey,
    );

    if (!fieldConfig) {
      return;
    }

    const value = crlvReviewData.data?.[fieldConfig.key];

    if (value === null || value === undefined || value === "") {
      return;
    }

    const input = document.getElementById(fieldConfig.inputId);

    if (!input || input.disabled) {
      return;
    }

    const currentValue =
      typeof input.value === "string" ? input.value.trim() : input.value;

    if (currentValue) {
      const confirmed = window.confirm(
        `O campo "${fieldConfig.label}" já está preenchido com "${currentValue}". Substituir pelo valor lido do CRLV ("${value}")?`,
      );

      if (!confirmed) {
        return;
      }
    }

    input.value = value;
    appliedCount += 1;
  });

  crlvReviewPanel.hidden = true;
  crlvCancelButton.hidden = true;

  showMessage(
    appliedCount > 0
      ? `${appliedCount} campo(s) preenchido(s) a partir do CRLV. Revise e salve o veículo.`
      : "Nenhum campo foi aplicado.",
    "success",
  );

  updateFinanceSummary();

  // O arquivo já cumpriu seu papel: descarta a referência local.
  resetCrlvState();

  // Com marca/modelo/ano (e cilindrada/potência, quando lidas do CRLV)
  // já no formulário, busca o motor exato e preenche o restante dos
  // detalhes técnicos (velocidade máxima, passageiros, porta-malas,
  // câmbio) — só em campos ainda vazios. Roda em segundo plano: não
  // atrasa nem bloqueia a aplicação dos dados do CRLV.
  autoFillSpecsFromCrlv();
});
