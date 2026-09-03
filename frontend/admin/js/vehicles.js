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
    const response = await fetch(`${API_URL}/vehicles`);

    if (!response.ok) {
      throw new Error("Erro ao buscar veículos.");
    }

    const data = await response.json();

    vehicles = data.vehicles;

    populateBrandFilter();
    renderVehicles();
    updateVehicleAIInsights();
  } catch (error) {
    console.error(error);

    tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="table-message error">
                    Não foi possível carregar os veículos.
                </td>
            </tr>
        `;
  }
}

function populateBrandFilter() {
  const brands = [...new Set(vehicles.map((vehicle) => vehicle.brand))].sort();

  brandFilter.innerHTML = `
        <option value="">Todas as marcas</option>
    `;

  brands.forEach((brand) => {
    const option = document.createElement("option");

    option.value = brand;
    option.textContent = brand;

    brandFilter.appendChild(option);
  });
}

function renderVehicles() {
  const search = searchInput.value.toLowerCase().trim();
  const status = statusFilter.value;
  const brand = brandFilter.value;

  const filteredVehicles = vehicles.filter((vehicle) => {
    const matchesSearch =
      vehicle.brand.toLowerCase().includes(search) ||
      vehicle.model.toLowerCase().includes(search);

    const matchesStatus = !status || vehicle.status === status;

    const matchesBrand = !brand || vehicle.brand === brand;

    return matchesSearch && matchesStatus && matchesBrand;
  });

  vehicleCount.textContent = `${filteredVehicles.length} veículo${filteredVehicles.length !== 1 ? "s" : ""}`;

  if (filteredVehicles.length === 0) {
    tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="table-message">
                    Nenhum veículo encontrado.
                </td>
            </tr>
        `;

    return;
  }

  tableBody.innerHTML = filteredVehicles
    .map((vehicle) => {
      const price = Number(vehicle.price).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

      const mileage = vehicle.mileage
        ? `${Number(vehicle.mileage).toLocaleString("pt-BR")} km`
        : "-";

      return `
            <tr>

                <td>
                    <div class="table-vehicle">

                        <div class="table-vehicle-image">
                            <img
                                src="${vehicle.image_url || "https://via.placeholder.com/80x60"}"
                                alt="${vehicle.brand} ${vehicle.model}"
                            >
                        </div>

                        <div>
                            <strong>
                                ${vehicle.brand} ${vehicle.model}
                            </strong>

                            <span>
                                ID #${vehicle.id}
                            </span>
                        </div>

                    </div>
                </td>

                <td>
                    ${vehicle.year}
                </td>

                <td>
                    ${price}
                </td>

                <td>
                    ${mileage}
                </td>

                <td>
                    <span class="status-badge status-${vehicle.status}">
                        ${formatStatus(vehicle.status)}
                    </span>
                </td>

                <td>

                    <div class="table-actions">
                        ${['available', 'reserved'].includes(vehicle.status) ? `<a href="./sales.html?vehicle=${vehicle.id}" class="table-action">Vender</a>` : ''}

                        <a
                            href="./vehicle-form.html?id=${vehicle.id}"
                            class="table-action"
                        >
                            Editar
                        </a>

                        <button
                            class="table-action danger"
                            onclick="deleteVehicle(${vehicle.id})"
                        >
                            Excluir
                        </button>

                    </div>

                </td>

            </tr>
        `;
    })
    .join("");
}

/* ==========================================
   IA - INSIGHTS DO ESTOQUE
========================================== */

function updateVehicleAIInsights() {
  if (!vehicles || vehicles.length === 0) {
    return;
  }

  const highestMarginVehicle = document.getElementById(
    "aiHighestMarginVehicle",
  );

  const highestMarginValue = document.getElementById("aiHighestMarginValue");

  const oldestVehicle = document.getElementById("aiOldestVehicle");

  const oldestVehicleDays = document.getElementById("aiOldestVehicleDays");

  const summaryText = document.getElementById("aiSummaryText");

  /* ======================================
       MAIOR MARGEM
    ====================================== */

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

      /*
                Margem sobre o custo.

                Exemplo:
                Compra = 100.000
                Venda = 120.000

                (20.000 / 100.000) * 100 = 20%
            */

      const margin = ((salePrice - purchasePrice) / purchasePrice) * 100;

      return {
        ...vehicle,
        calculatedMargin: margin,
      };
    })
    .sort((a, b) => b.calculatedMargin - a.calculatedMargin);

  const bestMargin = vehiclesWithMargin[0];

  if (bestMargin) {
    highestMarginVehicle.textContent = `${bestMargin.brand} ${bestMargin.model}`;

    highestMarginValue.textContent = `${bestMargin.calculatedMargin.toFixed(1)}% de margem`;
  } else {
    highestMarginVehicle.textContent = "Sem dados suficientes";

    highestMarginValue.textContent = "Cadastre o preço de compra";
  }

  /* ======================================
       DIAS EM ESTOQUE
    ====================================== */

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
    oldestVehicle.textContent = `${mostStoppedVehicle.brand} ${mostStoppedVehicle.model}`;

    oldestVehicleDays.textContent = `${mostStoppedVehicle.daysInStock} dias em estoque`;
  } else {
    oldestVehicle.textContent = "Sem dados suficientes";

    oldestVehicleDays.textContent = "Cadastre a data de entrada";
  }

  /* ======================================
       RESUMO INTELIGENTE
    ====================================== */

  const stoppedVehicles = vehiclesWithEntryDate.filter(
    (vehicle) => vehicle.daysInStock >= 60,
  );

  if (mostStoppedVehicle) {
    if (stoppedVehicles.length > 0) {
      summaryText.textContent =
        `Você tem ${stoppedVehicles.length} veículo${
          stoppedVehicles.length !== 1 ? "s" : ""
        } há mais de 60 dias no estoque. ` +
        `O ${mostStoppedVehicle.brand} ${mostStoppedVehicle.model} ` +
        `está há ${mostStoppedVehicle.daysInStock} dias parado. ` +
        `Considere revisar o preço ou aumentar a divulgação.`;
    } else {
      summaryText.textContent =
        `Seu estoque está com bom giro. ` +
        `Nenhum veículo está há mais de 60 dias parado. ` +
        `O veículo há mais tempo no estoque é o ` +
        `${mostStoppedVehicle.brand} ${mostStoppedVehicle.model}, ` +
        `com ${mostStoppedVehicle.daysInStock} dias.`;
    }
  } else {
    summaryText.textContent =
      "Cadastre a data de entrada dos veículos para receber análises do estoque.";
  }
}

async function deleteVehicle(id) {
  const vehicle = vehicles.find((vehicle) => vehicle.id === id);

  if (!vehicle) {
    return;
  }

  const confirmed = confirm(
    `Deseja realmente excluir ${vehicle.brand} ${vehicle.model}?`,
  );

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

    alert(error.message);
  }
}

function formatStatus(status) {
  const statuses = {
    available: "Disponível",
    reserved: "Reservado",
    sold: "Vendido",
  };

  return statuses[status] || "Sem status";
}

searchInput.addEventListener("input", renderVehicles);

statusFilter.addEventListener("change", renderVehicles);

brandFilter.addEventListener("change", renderVehicles);

/* ==========================================
   PERGUNTAR PARA A IA
========================================== */

const aiQuestion = document.getElementById("aiQuestion");
const aiSendQuestion = document.getElementById("aiSendQuestion");
const aiSummaryText = document.getElementById("aiSummaryText");

async function askVehicleAI(question) {
  const text = question.trim();

  if (!text) {
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

aiSendQuestion.addEventListener("click", () => {
  askVehicleAI(aiQuestion.value);
});

aiQuestion.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();

    askVehicleAI(aiQuestion.value);
  }
});

document.querySelectorAll(".ai-suggestions button").forEach((button) => {
  button.addEventListener("click", () => {
    const question = button.textContent.trim();

    aiQuestion.value = question;

    askVehicleAI(question);
  });
});
