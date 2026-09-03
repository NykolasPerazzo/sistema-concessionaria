requireAuth().then((user) => {
  if (!user) {
    return;
  }

  loadDashboard();
});

/* =========================================
   CARREGAR DASHBOARD
========================================= */

async function loadDashboard() {
  try {
    const [summaryResponse, vehiclesResponse] = await Promise.all([
      fetch(`${API_URL}/dashboard/summary`, {
        credentials: "include",
      }),

      fetch(`${API_URL}/vehicles`, {
        credentials: "include",
      }),
    ]);

    if (!summaryResponse.ok) {
      throw new Error("Não foi possível carregar o resumo do dashboard.");
    }

    if (!vehiclesResponse.ok) {
      throw new Error("Não foi possível carregar os veículos.");
    }

    const summary = await summaryResponse.json();

    const vehiclesData = await vehiclesResponse.json();

    const vehicles = vehiclesData.vehicles || [];

    updateDashboardSummary(summary);

    renderRecentVehicles(vehicles);
  } catch (error) {
    console.error("Erro ao carregar dashboard:", error);

    const recentVehicles = document.getElementById("recentVehicles");

    if (recentVehicles) {
      recentVehicles.innerHTML = `
        <p class="error">
          Não foi possível carregar os dados.
        </p>
      `;
    }
  }
}

/* =========================================
   RESUMO DO DASHBOARD
========================================= */

function updateDashboardSummary(summary) {
  setText("totalVehicles", summary.totalVehicles || 0);

  setText("availableVehicles", summary.availableVehicles || 0);

  setText("reservedVehicles", summary.reservedVehicles || 0);

  setText("soldVehicles", summary.soldVehicles || 0);

  setText("investedStock", formatCurrency(summary.investedStock));

  setText("stockExpenses", formatCurrency(summary.stockExpenses));

  setText("totalStockCost", formatCurrency(summary.totalCost));

  setText("advertisedStock", formatCurrency(summary.advertisedStock));

  setText("potentialProfit", formatCurrency(summary.potentialProfit));

  setText(
    "potentialMargin",
    `${Number(summary.potentialMargin || 0).toFixed(2)}%`,
  );

  updateOldestStock(summary.oldestEntryDate);

  renderStockAlerts(summary);

  renderOldVehicles(summary.oldVehicles || []);
}

/* =========================================
   VEÍCULO MAIS ANTIGO
========================================= */

function updateOldestStock(entryDate) {
  const daysElement = document.getElementById("oldestStockDays");

  const dateElement = document.getElementById("oldestStockDate");

  if (!entryDate) {
    if (daysElement) {
      daysElement.textContent = "0 dias";
    }

    if (dateElement) {
      dateElement.textContent = "Nenhum veículo em estoque";
    }

    return;
  }

  const entry = new Date(entryDate);

  const today = new Date();

  entry.setHours(0, 0, 0, 0);

  today.setHours(0, 0, 0, 0);

  const difference = today - entry;

  const days = Math.max(0, Math.floor(difference / (1000 * 60 * 60 * 24)));

  if (daysElement) {
    daysElement.textContent = `${days} ${days === 1 ? "dia" : "dias"}`;
  }

  if (dateElement) {
    dateElement.textContent = `Entrada: ${entry.toLocaleDateString("pt-BR")}`;
  }
}

/* =========================================
   ALERTAS DO ESTOQUE
========================================= */

function renderStockAlerts(summary) {
  const container = document.getElementById("stockAlerts");

  if (!container) {
    return;
  }

  const alerts = [];

  /* =====================================
     VEÍCULO MAIS ANTIGO
  ====================================== */

  if (summary.oldestEntryDate) {
    const entry = new Date(summary.oldestEntryDate);

    const today = new Date();

    entry.setHours(0, 0, 0, 0);

    today.setHours(0, 0, 0, 0);

    const days = Math.floor((today - entry) / (1000 * 60 * 60 * 24));

    if (days >= 90) {
      alerts.push({
        type: "danger",

        title: "Estoque crítico",

        message: `Existe veículo no estoque há ${days} dias.`,
      });
    } else if (days >= 60) {
      alerts.push({
        type: "warning",

        title: "Veículo parado há muito tempo",

        message: `Existe veículo no estoque há ${days} dias.`,
      });
    }
  }

  /* =====================================
     LUCRO POTENCIAL NEGATIVO
  ====================================== */

  if (Number(summary.potentialProfit || 0) < 0) {
    alerts.push({
      type: "danger",

      title: "Lucro potencial negativo",

      message: "O custo total do estoque está acima do valor anunciado.",
    });
  }

  /* =====================================
     MARGEM BAIXA
  ====================================== */

  const margin = Number(summary.potentialMargin || 0);

  if (margin > 0 && margin < 10) {
    alerts.push({
      type: "warning",

      title: "Margem potencial baixa",

      message: `A margem atual do estoque está em ${margin.toFixed(2)}%.`,
    });
  }

  /* =====================================
     SEM ALERTAS
  ====================================== */

  if (alerts.length === 0) {
    container.innerHTML = `
      <div class="stock-alert success">

        <strong>
          Estoque saudável
        </strong>

        <span>
          Nenhum alerta importante no momento.
        </span>

      </div>
    `;

    return;
  }

  /* =====================================
     MOSTRAR ALERTAS
  ====================================== */

  container.innerHTML = alerts
    .map((alert) => {
      return `
          <div class="stock-alert ${alert.type}">

            <strong>
              ${alert.title}
            </strong>

            <span>
              ${alert.message}
            </span>

          </div>
        `;
    })
    .join("");
}

/* =========================================
   VEÍCULOS MAIS ANTIGOS
========================================= */

function renderOldVehicles(vehicles) {
  const container = document.getElementById("oldVehicles");

  if (!container) return;

  if (!vehicles || vehicles.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        Nenhum veículo encontrado no estoque.
      </div>
    `;
    return;
  }

  container.innerHTML = vehicles
    .map((vehicle) => {
      const days = Number(vehicle.daysInStock || 0);
      const purchasePrice = Number(vehicle.purchasePrice || 0);
      const advertisedPrice = Number(vehicle.price || 0);

      let stockClass = "normal";
      let stockLabel = "Recente";

      if (days >= 90) {
        stockClass = "danger";
        stockLabel = "Crítico";
      } else if (days >= 60) {
        stockClass = "warning";
        stockLabel = "Atenção";
      } else if (days >= 30) {
        stockClass = "attention";
        stockLabel = "Acompanhar";
      }

      const image =
        vehicle.image_url || vehicle.imageUrl || vehicle.image || "";

      return `
        <a
          href="./vehicle-form.html?id=${vehicle.id}"
          class="stock-showcase-card"
        >

          <div class="stock-showcase-top">

            <span class="stock-showcase-brand">
              ${vehicle.brand || "VEÍCULO"}
            </span>

            <span class="stock-badge ${stockClass}">
              ${stockLabel}
            </span>

          </div>

          <h3 class="stock-showcase-name">
            ${vehicle.brand || ""}
            ${vehicle.model || ""}
          </h3>

          <div class="stock-showcase-days">
            <strong>${days}</strong>

            <span>
              ${days === 1 ? "dia" : "dias"} no estoque
            </span>
          </div>

          <div class="stock-showcase-image">

            ${
              image
                ? `
                  <img
                    src="${image}"
                    alt="${vehicle.brand || ""} ${vehicle.model || ""}"
                  >
                `
                : `
                  <div class="stock-no-image">
                    Sem imagem
                  </div>
                `
            }

          </div>

          <div class="stock-showcase-prices">

            <div>
              <span>Compra</span>

              <strong>
                ${formatCurrency(purchasePrice)}
              </strong>
            </div>

            <div>
              <span>Anunciado</span>

              <strong>
                ${formatCurrency(advertisedPrice)}
              </strong>
            </div>

          </div>

        </a>
      `;
    })
    .join("");
}

/* =========================================
   VEÍCULOS RECENTES
========================================= */

function renderRecentVehicles(vehicles) {
  const container = document.getElementById("recentVehicles");

  if (!container) {
    return;
  }

  if (vehicles.length === 0) {
    container.innerHTML = `
      <p class="loading">
        Nenhum veículo cadastrado.
      </p>
    `;

    return;
  }

  const recentVehicles = [...vehicles]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, 6);

  container.innerHTML = recentVehicles
    .map((vehicle) => {
      const price = formatCurrency(vehicle.price);

      const mileage = vehicle.mileage
        ? `${Number(vehicle.mileage).toLocaleString("pt-BR")} km`
        : "Quilometragem não informada";

      const status = formatStatus(vehicle.status);

      return `
          <div class="vehicle-row">

            <div class="vehicle-main">

              <strong>
                ${vehicle.brand || ""}
                ${vehicle.model || ""}
              </strong>


              <span>
                ${vehicle.year || "Ano não informado"}
                •
                ${mileage}
              </span>

            </div>


            <div>

              <div class="vehicle-price">
                ${price}
              </div>


              <div class="vehicle-status">
                ${status}
              </div>

            </div>

          </div>
        `;
    })
    .join("");
}

/* =========================================
   STATUS
========================================= */

function formatStatus(status) {
  const statuses = {
    available: "Disponível",

    reserved: "Reservado",

    sold: "Vendido",
  };

  return statuses[status] || "Sem status";
}

/* =========================================
   FORMATAR MOEDA
========================================= */

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",

    currency: "BRL",
  });
}

/* =========================================
   UTILITÁRIO
========================================= */

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

/* =========================================
   TEMA CLARO / ESCURO
========================================= */

const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");

function setTheme(theme) {
  const isLight = theme === "light";

  document.body.classList.toggle("light-theme", isLight);

  if (themeIcon) {
    themeIcon.className = isLight ? "fa-solid fa-sun" : "fa-solid fa-moon";
  }
}

/* =========================================
   RECUPERAR TEMA SALVO
========================================= */

const savedTheme = localStorage.getItem("carDealerAdminTheme") || "dark";

setTheme(savedTheme);

/* =========================================
   ALTERAR TEMA
========================================= */

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const isLight = document.body.classList.contains("light-theme");

    const newTheme = isLight ? "dark" : "light";

    localStorage.setItem("carDealerAdminTheme", newTheme);

    setTheme(newTheme);
  });
}
