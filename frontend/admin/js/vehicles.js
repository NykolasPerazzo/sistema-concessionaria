let vehicles = [];

const tableBody = document.getElementById("vehiclesTableBody");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const brandFilter = document.getElementById("brandFilter");
const vehicleCount = document.getElementById("vehicleCount");

requireAuth().then((user) => {
  if (!user) {
    return;
  }

  loadVehicles();
});

async function loadVehicles() {
  try {
    const response = await fetch(`${API_URL}/vehicles`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Erro ao buscar veículos.");
    }

    const data = await response.json();

    vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];

    populateBrandFilter();
    renderVehicles();
    updateVehicleAIInsights();
  } catch (error) {
    console.error(error);

    if (tableBody) {
      tableBody.innerHTML = `
        <tr class="vehicle-card-row vehicle-message-row">
          <td colspan="6" class="vehicle-card-cell">
            <div class="table-message error">Não foi possível carregar os veículos.</div>
          </td>
        </tr>
      `;
    }
  }
}

function populateBrandFilter() {
  if (!brandFilter) return;

  const brands = [
    ...new Set(vehicles.map((vehicle) => vehicle.brand).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  brandFilter.innerHTML = `<option value="">Todas as marcas</option>`;

  brands.forEach((brand) => {
    const option = document.createElement("option");

    option.value = brand;
    option.textContent = brand;

    brandFilter.appendChild(option);
  });
}

function renderVehicles() {
  if (!tableBody) return;

  const search = (searchInput?.value || "").toLowerCase().trim();
  const status = statusFilter?.value || "";
  const brand = brandFilter?.value || "";

  const filteredVehicles = vehicles.filter((vehicle) => {
    const vehicleBrand = String(vehicle.brand || "").toLowerCase();
    const vehicleModel = String(vehicle.model || "").toLowerCase();

    const matchesSearch =
      !search || vehicleBrand.includes(search) || vehicleModel.includes(search);

    const matchesStatus = !status || vehicle.status === status;
    const matchesBrand = !brand || vehicle.brand === brand;

    return matchesSearch && matchesStatus && matchesBrand;
  });

  if (vehicleCount) {
    vehicleCount.textContent = `${filteredVehicles.length} veículo${
      filteredVehicles.length !== 1 ? "s" : ""
    }`;
  }

  updateVehiclesKpis(filteredVehicles);

  if (filteredVehicles.length === 0) {
    tableBody.innerHTML = `
      <tr class="vehicle-card-row vehicle-message-row">
        <td colspan="6" class="vehicle-card-cell">
          <div class="table-message">Nenhum veículo encontrado.</div>
        </td>
      </tr>
    `;

    return;
  }

  tableBody.innerHTML = filteredVehicles
    .map((vehicle) => renderVehicleCardRow(vehicle))
    .join("");
}

function renderVehicleCardRow(vehicle) {
  const name = getVehicleName(vehicle);
  const price = formatCurrency(vehicle.price);
  const mileage = formatMileage(vehicle.mileage);
  const image = safeVehicleImage(
    vehicle.image_url || vehicle.imageUrl || vehicle.image || "",
  );

  const status = getStatusInfo(vehicle.status);
  const days = getVehicleDaysInStock(vehicle);
  const margin = getVehicleMargin(vehicle);
  const vehicleId = encodeURIComponent(vehicle.id || "");
  const canSell = ["available", "reserved"].includes(vehicle.status);

  return `
    <tr class="vehicle-card-row">
      <td colspan="6" class="vehicle-card-cell">
        <article class="vehicle-stock-card ${escapeHtml(status.className)}">
          <div class="vehicle-stock-image">
            <span class="vehicle-status-pill ${escapeHtml(status.className)}">
              ${escapeHtml(status.label)}
            </span>

            ${
              image
                ? `
                  <img
                    src="${escapeHtml(image)}"
                    alt="${escapeHtml(name)}"
                    loading="lazy"
                    decoding="async"
                  >
                `
                : `
                  <div class="vehicle-image-placeholder">
                    <span>Sem imagem</span>
                  </div>
                `
            }
          </div>

          <div class="vehicle-stock-body">
            <div class="vehicle-stock-title-row">
              <div>
                <h3>${escapeHtml(name)}</h3>
                <small>ID #${escapeHtml(vehicle.id || "-")}</small>
              </div>

              <button
                type="button"
                class="vehicle-favorite-button"
                aria-label="Favoritar veículo"
              >
                ♡
              </button>
            </div>

            <div class="vehicle-stock-specs">
              <span>${escapeHtml(vehicle.year || "Ano não informado")}</span>
              <span>${escapeHtml(mileage)}</span>
              <span>
                ${escapeHtml(
                  vehicle.fuel ||
                    vehicle.fuel_type ||
                    "Combustível não informado",
                )}
              </span>
            </div>

            <div class="vehicle-stock-result">
              <strong>${price}</strong>

              <span>
                ${
                  vehicle.status === "sold"
                    ? "Venda concluída"
                    : `${days} ${days === 1 ? "dia" : "dias"} no estoque`
                }
              </span>
            </div>

            <div class="vehicle-stock-intel">
              <span>
                ${
                  margin !== null
                    ? `${margin.toFixed(1)}% de margem`
                    : "Margem não informada"
                }
              </span>

              <span>
                ${
                  vehicle.status === "sold"
                    ? "Venda concluída"
                    : getVehiclePriorityLabel(vehicle, days, margin)
                }
              </span>
            </div>
          </div>

          <div class="vehicle-stock-actions">
            ${
              canSell
                ? `
                  <a
                    href="./sales.html?vehicle=${vehicleId}"
                    class="table-action sell-action"
                  >
                    Vender
                  </a>
                `
                : ""
            }

            <a
              href="./vehicle-form.html?id=${vehicleId}"
              class="table-action"
            >
              Editar
            </a>

            <button
              class="table-action ai-action"
              type="button"
              onclick="askVehicleAI('Analise o veículo ${escapeInlineJs(name)}')"
            >
              Ver IA
            </button>

            <button
              class="table-action danger"
              type="button"
              onclick="deleteVehicle(${Number(vehicle.id) || 0})"
            >
              Excluir
            </button>
          </div>
        </article>
      </td>
    </tr>
  `;
}

function updateVehiclesKpis(list = vehicles) {
  setTextById(
    "vehiclesAvailableKpi",
    list.filter((vehicle) => vehicle.status === "available").length,
  );

  setTextById(
    "vehiclesAttentionKpi",
    list.filter((vehicle) => {
      const days = getVehicleDaysInStock(vehicle);

      return vehicle.status !== "sold" && days >= 60;
    }).length,
  );

  setTextById(
    "vehiclesSoldKpi",
    list.filter((vehicle) => vehicle.status === "sold").length,
  );

  const potentialMargin = list.reduce((total, vehicle) => {
    if (vehicle.status === "sold") return total;

    const purchase = Number(
      vehicle.purchase_price || vehicle.purchasePrice || 0,
    );

    const price = Number(vehicle.price || 0);

    if (!purchase || !price || price <= purchase) return total;

    return total + (price - purchase);
  }, 0);

  setTextById("vehiclesMarginKpi", formatCurrency(potentialMargin));
}

function getVehicleName(vehicle) {
  return `${vehicle.brand || ""} ${vehicle.model || ""}`.trim() || "Veículo";
}

function formatMileage(value) {
  const mileage = Number(value || 0);

  if (!Number.isFinite(mileage) || mileage <= 0) {
    return "Km não informado";
  }

  return `${mileage.toLocaleString("pt-BR")} km`;
}

function getVehicleDaysInStock(vehicle) {
  const rawDate = vehicle.entry_date || vehicle.entryDate || vehicle.created_at;

  if (vehicle.daysInStock !== undefined && vehicle.daysInStock !== null) {
    return Math.max(0, Number(vehicle.daysInStock) || 0);
  }

  if (!rawDate) return 0;

  const entryDate = new Date(rawDate);
  const today = new Date();

  if (Number.isNaN(entryDate.getTime())) return 0;

  entryDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return Math.max(0, Math.floor((today - entryDate) / 86400000));
}

function getVehicleMargin(vehicle) {
  const purchase = Number(vehicle.purchase_price || vehicle.purchasePrice || 0);
  const price = Number(vehicle.price || 0);

  if (!purchase || !price || purchase <= 0) return null;

  return ((price - purchase) / purchase) * 100;
}

function getVehiclePriorityLabel(vehicle, days, margin) {
  if (vehicle.status === "sold") return "Venda concluída";
  if (days >= 90) return "Crítico";
  if (days >= 60) return "Atenção";
  if (margin !== null && margin < 10) return "Margem baixa";

  return "Em dia";
}

function getStatusInfo(status) {
  const statuses = {
    available: {
      label: "Disponível",
      className: "available",
    },

    reserved: {
      label: "Reservado",
      className: "reserved",
    },

    sold: {
      label: "Vendido",
      className: "sold",
    },
  };

  return (
    statuses[status] || {
      label: "Sem status",
      className: "unknown",
    }
  );
}

function safeVehicleImage(value) {
  if (!value) return "";

  try {
    const url = new URL(value, window.location.href);

    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    return url.href;
  } catch (error) {
    return "";
  }
}

function setTextById(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );
}

function escapeInlineJs(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ");
}

/* ==========================================
   IA - INSIGHTS DO ESTOQUE
========================================== */

function updateVehicleAIInsights() {
  if (!vehicles || vehicles.length === 0) {
    setTextById(
      "aiSummaryText",
      "Cadastre veículos para receber análises inteligentes do estoque.",
    );

    return;
  }

  const highestMarginVehicle = document.getElementById(
    "aiHighestMarginVehicle",
  );

  const highestMarginValue = document.getElementById("aiHighestMarginValue");

  const oldestVehicle = document.getElementById("aiOldestVehicle");

  const oldestVehicleDays = document.getElementById("aiOldestVehicleDays");

  const summaryText = document.getElementById("aiSummaryText");

  const fastestVehicle = document.getElementById("aiFastestVehicle");

  const fastestVehicleDays = document.getElementById("aiFastestVehicleDays");

  const vehiclesWithMargin = vehicles
    .filter((vehicle) => {
      return (
        vehicle.purchase_price &&
        Number(vehicle.purchase_price) > 0 &&
        vehicle.price &&
        Number(vehicle.price) > 0 &&
        vehicle.status !== "sold"
      );
    })
    .map((vehicle) => {
      const purchasePrice = Number(vehicle.purchase_price);
      const salePrice = Number(vehicle.price);
      const margin = ((salePrice - purchasePrice) / purchasePrice) * 100;

      return {
        ...vehicle,
        calculatedMargin: margin,
      };
    })
    .sort((a, b) => b.calculatedMargin - a.calculatedMargin);

  const bestMargin = vehiclesWithMargin[0];

  if (bestMargin) {
    if (highestMarginVehicle) {
      highestMarginVehicle.textContent = getVehicleName(bestMargin);
    }

    if (highestMarginValue) {
      highestMarginValue.textContent = `${bestMargin.calculatedMargin.toFixed(
        1,
      )}% de margem`;
    }
  } else {
    if (highestMarginVehicle) {
      highestMarginVehicle.textContent = "Sem dados suficientes";
    }

    if (highestMarginValue) {
      highestMarginValue.textContent = "Cadastre o preço de compra";
    }
  }

  const today = new Date();

  const vehiclesWithEntryDate = vehicles
    .filter((vehicle) => {
      return vehicle.entry_date && vehicle.status !== "sold";
    })
    .map((vehicle) => {
      const entryDate = new Date(vehicle.entry_date);
      const difference = today - entryDate;

      const daysInStock = Math.max(
        0,
        Math.floor(difference / (1000 * 60 * 60 * 24)),
      );

      return {
        ...vehicle,
        daysInStock,
      };
    })
    .sort((a, b) => b.daysInStock - a.daysInStock);

  const mostStoppedVehicle = vehiclesWithEntryDate[0];

  if (mostStoppedVehicle) {
    if (oldestVehicle) {
      oldestVehicle.textContent = getVehicleName(mostStoppedVehicle);
    }

    if (oldestVehicleDays) {
      oldestVehicleDays.textContent = `${mostStoppedVehicle.daysInStock} dias em estoque`;
    }
  } else {
    if (oldestVehicle) {
      oldestVehicle.textContent = "Sem dados suficientes";
    }

    if (oldestVehicleDays) {
      oldestVehicleDays.textContent = "Cadastre a data de entrada";
    }
  }

  const fastest = vehiclesWithEntryDate
    .filter((vehicle) => vehicle.status === "sold" || vehicle.daysInStock > 0)
    .sort((a, b) => a.daysInStock - b.daysInStock)[0];

  if (fastest) {
    if (fastestVehicle) {
      fastestVehicle.textContent = getVehicleName(fastest);
    }

    if (fastestVehicleDays) {
      fastestVehicleDays.textContent = `${fastest.daysInStock} dias em estoque`;
    }
  } else {
    if (fastestVehicle) {
      fastestVehicle.textContent = "Calculando...";
    }

    if (fastestVehicleDays) {
      fastestVehicleDays.textContent = "-";
    }
  }

  const stoppedVehicles = vehiclesWithEntryDate.filter(
    (vehicle) => vehicle.daysInStock >= 60,
  );

  if (mostStoppedVehicle) {
    if (stoppedVehicles.length > 0) {
      if (summaryText) {
        summaryText.textContent =
          `Você tem ${stoppedVehicles.length} veículo${
            stoppedVehicles.length !== 1 ? "s" : ""
          } há mais de 60 dias no estoque. ` +
          `O ${mostStoppedVehicle.brand} ${mostStoppedVehicle.model} ` +
          `está há ${mostStoppedVehicle.daysInStock} dias parado. ` +
          `Considere revisar o preço ou aumentar a divulgação.`;
      }
    } else {
      if (summaryText) {
        summaryText.textContent =
          `Seu estoque está com bom giro. ` +
          `Nenhum veículo está há mais de 60 dias parado. ` +
          `O veículo há mais tempo no estoque é o ` +
          `${mostStoppedVehicle.brand} ${mostStoppedVehicle.model}, ` +
          `com ${mostStoppedVehicle.daysInStock} dias.`;
      }
    }
  } else {
    if (summaryText) {
      summaryText.textContent =
        "Cadastre a data de entrada dos veículos para receber análises do estoque.";
    }
  }
}

/* ==========================================
   MODAL DE CONFIRMAÇÃO
========================================== */

const confirmModal = document.getElementById("confirmModal");
const confirmModalTitle = document.getElementById("confirmModalTitle");
const confirmModalMessage = document.getElementById("confirmModalMessage");
const confirmModalCancel = document.getElementById("confirmModalCancel");
const confirmModalConfirm = document.getElementById("confirmModalConfirm");
const confirmModalBackdrop = document.getElementById("confirmModalBackdrop");

function closeConfirmModal() {
  if (!confirmModal) return;

  confirmModal.classList.remove("is-visible");

  setTimeout(() => {
    confirmModal.hidden = true;

    if (confirmModalCancel) {
      confirmModalCancel.hidden = false;
    }
  }, 200);
}

function openConfirmModal({ title, message, confirmText = "Confirmar" }) {
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
    confirmModalCancel.hidden = false;
    confirmModal.hidden = false;

    requestAnimationFrame(() => {
      confirmModal.classList.add("is-visible");
    });

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
      if (event.key === "Escape") {
        onCancel();
      }
    }

    confirmModalConfirm.addEventListener("click", onConfirm);
    confirmModalCancel.addEventListener("click", onCancel);
    confirmModalBackdrop.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKeydown);
  });
}

function showModalMessage({ title, message }) {
  return new Promise((resolve) => {
    if (
      !confirmModal ||
      !confirmModalTitle ||
      !confirmModalMessage ||
      !confirmModalCancel ||
      !confirmModalConfirm ||
      !confirmModalBackdrop
    ) {
      resolve();
      return;
    }

    confirmModalTitle.textContent = title;
    confirmModalMessage.textContent = message;
    confirmModalConfirm.textContent = "Entendi";
    confirmModalCancel.hidden = true;
    confirmModal.hidden = false;

    requestAnimationFrame(() => {
      confirmModal.classList.add("is-visible");
    });

    function finish() {
      closeConfirmModal();

      confirmModalConfirm.removeEventListener("click", onOk);
      confirmModalBackdrop.removeEventListener("click", onOk);
      document.removeEventListener("keydown", onKeydown);

      resolve();
    }

    function onOk() {
      finish();
    }

    function onKeydown(event) {
      if (event.key === "Escape") {
        onOk();
      }
    }

    confirmModalConfirm.addEventListener("click", onOk);
    confirmModalBackdrop.addEventListener("click", onOk);
    document.addEventListener("keydown", onKeydown);
  });
}

async function deleteVehicle(id) {
  const vehicle = vehicles.find((vehicle) => Number(vehicle.id) === Number(id));

  if (!vehicle) {
    return;
  }

  const confirmed = await openConfirmModal({
    title: "Excluir veículo?",
    message: `Tem certeza que deseja excluir o ${vehicle.brand} ${vehicle.model}? Essa ação não pode ser desfeita.`,
    confirmText: "Excluir",
  });

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/vehicles/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erro ao excluir veículo.");
    }

    await loadVehicles();
  } catch (error) {
    console.error(error);

    await showModalMessage({
      title: "Não foi possível excluir",
      message: error.message,
    });
  }
}

/* ==========================================
   IA - PERGUNTAS
========================================== */

const aiQuestion = document.getElementById("aiQuestion");
const aiSendQuestion = document.getElementById("aiSendQuestion");
const aiSummaryText = document.getElementById("aiSummaryText");

async function askVehicleAI(question) {
  const text = String(question || "").trim();

  if (!text) {
    return;
  }

  if (!aiSendQuestion || !aiSummaryText || !aiQuestion) {
    return;
  }

  try {
    aiSendQuestion.disabled = true;
    aiSendQuestion.textContent = "...";

    aiSummaryText.textContent = "Analisando os dados do estoque...";

    const response = await fetch(`${API_URL}/ai/vehicles`, {
      method: "POST",
      credentials: "include",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        question: text,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível consultar a IA.");
    }

    aiSummaryText.textContent = data.answer;
    aiQuestion.value = "";
  } catch (error) {
    console.error("Erro IA:", error);

    aiSummaryText.textContent = error.message;
  } finally {
    aiSendQuestion.disabled = false;
    aiSendQuestion.textContent = "➤";
  }
}

if (aiSendQuestion) {
  aiSendQuestion.addEventListener("click", () => {
    askVehicleAI(aiQuestion.value);
  });
}

if (aiQuestion) {
  aiQuestion.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      askVehicleAI(aiQuestion.value);
    }
  });
}

document.querySelectorAll(".ai-suggestions button").forEach((button) => {
  button.addEventListener("click", () => {
    const question = button.textContent.trim();

    if (aiQuestion) {
      aiQuestion.value = question;
    }

    askVehicleAI(question);
  });
});

/* ==========================================
   STATUS E FORMATADORES
========================================== */

function formatStatus(status) {
  const statuses = {
    available: "Disponível",
    reserved: "Reservado",
    sold: "Vendido",
  };

  return statuses[status] || "Sem status";
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/* ==========================================
   FILTROS
========================================== */

if (searchInput) {
  searchInput.addEventListener("input", renderVehicles);
}

if (statusFilter) {
  statusFilter.addEventListener("change", renderVehicles);
}

if (brandFilter) {
  brandFilter.addEventListener("change", renderVehicles);
}
