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

const galleryImagesInput = document.getElementById("galleryImages");
const galleryPreview = document.getElementById("galleryPreview");

const params = new URLSearchParams(window.location.search);

const vehicleId = params.get("id");
const isEditing = Boolean(vehicleId);
const vehicleSaleLink = document.getElementById("vehicleSaleLink");
if (vehicleSaleLink && vehicleId) vehicleSaleLink.href = `./sales.html?vehicle=${encodeURIComponent(vehicleId)}`;

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
  } catch (error) {
    console.error(error);
  }
}

/* =========================
   PREENCHER FORMULÁRIO
========================= */

function fillForm(vehicle) {
  document.getElementById("brand").value = vehicle.brand || "";

  document.getElementById("model").value = vehicle.model || "";

  document.getElementById("year").value = vehicle.year || "";

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

  const description = document.getElementById("description").value.trim();

  if (description) {
    formData.append("description", description);
  }

  formData.append("status", document.getElementById("status").value);

  /*
            IMAGEM PRINCIPAL
        */

  const coverImage = coverImageInput.files[0];

  if (coverImage) {
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
