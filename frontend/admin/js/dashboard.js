requireAuth().then((user) => {
  if (!user) return;

  loadDashboard();
  listenForNewLeads();
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

    updateDashboardSummary(summary, vehicles);
    updateCommandIntelligence(summary, vehicles);
    renderRecentVehicles(vehicles);
  } catch (error) {
    console.error("Erro ao carregar dashboard:", error);

    showDashboardError();
  }
}

/* =========================================
   RESUMO DO DASHBOARD
========================================= */

function updateDashboardSummary(summary, vehicles = []) {
  const totalVehicles = getNumber(summary.totalVehicles, vehicles.length);

  const availableVehicles = getNumber(
    summary.availableVehicles,
    vehicles.filter((vehicle) => vehicle.status === "available").length,
  );

  const reservedVehicles = getNumber(
    summary.reservedVehicles,
    vehicles.filter((vehicle) => vehicle.status === "reserved").length,
  );

  const soldVehicles = getNumber(
    summary.soldVehicles,
    vehicles.filter((vehicle) => vehicle.status === "sold").length,
  );

  const openLeads =
    summary.openLeads ??
    summary.totalLeads ??
    summary.pendingLeads ??
    totalVehicles;

  const qualifiedLeads = summary.qualifiedLeads ?? "—";

  const activeProposals =
    summary.activeProposals ?? summary.openProposals ?? reservedVehicles;

  const monthSales =
    summary.monthSales ?? summary.salesThisMonth ?? soldVehicles;

  setText("availableVehicles", availableVehicles);
  setText("totalVehicles", openLeads);
  setText("reservedVehicles", activeProposals);
  setText("soldVehicles", monthSales);

  setText("funnelLeads", openLeads);
  setText("funnelQualified", qualifiedLeads);
  setText("funnelProposals", activeProposals);
  setText("funnelSales", monthSales);

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
  renderOldVehicles(summary.oldVehicles || vehicles);
}

/* =========================================
   INTELIGÊNCIA DA CENTRAL
========================================= */

function updateCommandIntelligence(summary, vehicles = []) {
  const radar = evaluateOperation(summary, vehicles);

  const radarCard =
    document.getElementById("stockRadarCard") ||
    document.querySelector(".radar-card");

  if (radarCard) {
    radarCard.dataset.state = radar.state;
  }

  setText("radarStatusLabel", radar.label);
  setText("radarTitle", radar.title);
  setText("radarDescription", radar.description);
  setText("aiRecommendationTitle", radar.recommendationTitle);
  setText("aiRecommendationText", radar.recommendationText);

  updateRadarFallback(radar);
  updateRadarTag("radarStockTag", "Estoque", radar.stockLabel, radar.state);
  updateRadarTag("radarLeadsTag", "Leads", radar.leadsLabel, radar.leadsState);
  updateRadarTag(
    "radarProposalsTag",
    "Propostas",
    radar.proposalsLabel,
    radar.proposalsState,
  );

  renderLeadActions(summary);
}

function evaluateOperation(summary, vehicles = []) {
  const priorities = [];

  const days = getOldestStockDays(summary.oldestEntryDate);
  const profit = Number(summary.potentialProfit || 0);
  const margin = Number(summary.potentialMargin || 0);

  const openLeads = Number(
    summary.openLeads || summary.totalLeads || summary.pendingLeads || 0,
  );

  const activeProposals = Number(
    summary.activeProposals || summary.openProposals || 0,
  );

  if (days >= 90) {
    priorities.push({
      type: "danger",
      message: `O veículo mais antigo está há ${days} dias no estoque.`,
      action: "Ver estoque",
      href: "vehicles.html",
    });
  } else if (days >= 60) {
    priorities.push({
      type: "warning",
      message: `Existe veículo há ${days} dias no estoque.`,
      action: "Ver estoque",
      href: "vehicles.html",
    });
  }

  if (profit < 0) {
    priorities.push({
      type: "danger",
      message: "O custo do estoque está acima do valor anunciado.",
      action: "Analisar",
      href: "ai.html",
    });
  }

  if (margin > 0 && margin < 10) {
    priorities.push({
      type: "warning",
      message: `Margem potencial de ${margin.toFixed(2)}%.`,
      action: "Ajustar",
      href: "ai.html",
    });
  }

  if (openLeads > 0) {
    priorities.push({
      type: "danger",
      message: `${openLeads} ${openLeads === 1 ? "lead novo" : "leads novos"} para atender.`,
      action: "Atender",
      href: "leads.html",
    });
  }

  if (activeProposals > 0) {
    priorities.push({
      type: "warning",
      message: `${activeProposals} ${activeProposals === 1 ? "proposta ativa" : "propostas ativas"} para acompanhar.`,
      action: "Abrir",
      href: "proposals.html",
    });
  }

  let state = "good";
  let label = "Em dia";
  let title = "Operação em dia";
  let description =
    "Seu estoque não tem alerta crítico no momento. Continue acompanhando leads e anúncios.";
  let stockLabel = "Em dia";
  let recommendationTitle = "Mantenha o ritmo comercial";
  let recommendationText =
    "A IA não encontrou urgência agora. Foque em responder leads e manter anúncios atualizados.";

  if (priorities.some((priority) => priority.type === "danger")) {
    state = "critical";
    label = "Crítico";
    title = "A operação precisa de ação agora";
    description =
      "A IA encontrou pontos que podem travar margem, velocidade de venda ou atendimento.";
    stockLabel = days >= 90 || profit < 0 ? "Crítico" : "Atenção";
    recommendationTitle = "Resolva o item mais crítico primeiro";
    recommendationText =
      priorities[0]?.message || "Revise estoque, preço, margem e leads agora.";
  } else if (priorities.length > 0) {
    state = "warning";
    label = "Atenção";
    title = "Estoque parado exige atenção";
    description =
      "Priorize veículos com mais tempo no estoque e revise preço, fotos e anúncio.";
    stockLabel = "Atenção";
    recommendationTitle = "Revise a estratégia do estoque";
    recommendationText =
      priorities[0]?.message ||
      "Analise preço, anúncio e margem antes de agir.";
  }

  return {
    state,
    label,
    title,
    description,
    stockLabel,
    leadsLabel: openLeads > 0 ? "A atender" : "Em dia",
    leadsState: openLeads > 0 ? "warning" : "good",
    proposalsLabel: activeProposals > 0 ? "Acompanhar" : "Em dia",
    proposalsState: activeProposals > 0 ? "warning" : "good",
    recommendationTitle,
    recommendationText,
    priorities,
  };
}

/* =========================================
   PRIORIDADES
========================================= */

function renderStockAlerts(summary) {
  const container = document.getElementById("stockAlerts");

  if (!container) return;

  const radar = evaluateOperation(summary);
  const priorities = [...radar.priorities];

  if (priorities.length === 0) {
    priorities.push({
      type: "good",
      message: "Nenhuma prioridade crítica no estoque agora.",
      action: "Ver estoque",
      href: "vehicles.html",
    });
  }

  container.innerHTML = priorities
    .slice(0, 3)
    .map((priority) => {
      return `
        <div class="priority-row ${escapeDashboardHtml(priority.type)}">
          <span></span>
          <p>${escapeDashboardHtml(priority.message)}</p>
          <a href="${escapeDashboardHtml(priority.href)}">
            ${escapeDashboardHtml(priority.action)}
          </a>
          <i class="fa-solid fa-chevron-right"></i>
        </div>
      `;
    })
    .join("");
}

/* =========================================
   VEÍCULO MAIS ANTIGO
========================================= */

function updateOldestStock(entryDate) {
  const daysElement = document.getElementById("oldestStockDays");
  const dateElement = document.getElementById("oldestStockDate");

  if (!entryDate) {
    setElementText(daysElement, "0 dias");
    setElementText(dateElement, "Nenhum veículo em estoque");
    return;
  }

  const entry = new Date(entryDate);

  if (Number.isNaN(entry.getTime())) {
    setElementText(daysElement, "0 dias");
    setElementText(dateElement, "Data inválida");
    return;
  }

  const days = getOldestStockDays(entryDate);

  setElementText(daysElement, `${days} ${days === 1 ? "dia" : "dias"}`);
  setElementText(dateElement, `Entrada: ${entry.toLocaleDateString("pt-BR")}`);
}

function getOldestStockDays(entryDate) {
  if (!entryDate) return 0;

  const entry = new Date(entryDate);
  const today = new Date();

  if (Number.isNaN(entry.getTime())) return 0;

  entry.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return Math.max(0, Math.floor((today - entry) / 86400000));
}

/* =========================================
   VEÍCULOS IMPORTANTES
========================================= */

function renderOldVehicles(vehicles) {
  const container = document.getElementById("oldVehicles");

  if (!container) return;

  if (!vehicles || vehicles.length === 0) {
    container.innerHTML = `
      <div class="vehicle-intel-card empty-card">
        Nenhum veículo encontrado no estoque.
      </div>
    `;
    return;
  }

  const orderedVehicles = [...vehicles]
    .sort((a, b) => Number(b.daysInStock || 0) - Number(a.daysInStock || 0))
    .slice(0, 3);

  container.innerHTML = orderedVehicles
    .map((vehicle) => {
      const days = Number(vehicle.daysInStock || 0);
      const image = safeDashboardImage(
        vehicle.image_url || vehicle.imageUrl || vehicle.image || "",
      );

      let stockClass = "good";
      let stockLabel = "Em dia";

      if (days >= 90) {
        stockClass = "danger";
        stockLabel = "Crítico";
      } else if (days >= 60) {
        stockClass = "warning";
        stockLabel = "Atenção";
      }

      return `
        <a
          href="./vehicle-form.html?id=${encodeURIComponent(vehicle.id || "")}"
          class="vehicle-intel-card"
        >
          <span class="status-chip ${stockClass}">
            ${escapeDashboardHtml(stockLabel)}
          </span>

          <div class="vehicle-photo">
            ${
              image
                ? `
                  <img
                    src="${escapeDashboardHtml(image)}"
                    alt="${escapeDashboardHtml(`${vehicle.brand || ""} ${vehicle.model || ""}`.trim())}"
                    loading="lazy"
                    decoding="async"
                  >
                `
                : `<i class="fa-solid fa-car-side"></i>`
            }
          </div>

          <div class="vehicle-info">
            <h3>
              ${escapeDashboardHtml(`${vehicle.brand || ""} ${vehicle.model || ""}`.trim() || "Veículo")}
            </h3>

            <p>
              ${escapeDashboardHtml(vehicle.year || "Ano não informado")}
              •
              ${escapeDashboardHtml(formatStatus(vehicle.status))}
            </p>

            <div class="vehicle-meta">
              <strong>${formatCurrency(vehicle.price)}</strong>

              <span class="vehicle-days">
                <i class="fa-regular fa-clock"></i>
                ${days} ${days === 1 ? "dia" : "dias"}
              </span>
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

  if (!container) return;

  if (!vehicles || vehicles.length === 0) {
    container.innerHTML = `
      <div class="empty-card">
        Nenhum veículo cadastrado.
      </div>
    `;
    return;
  }

  const recentVehicles = [...vehicles]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, 4);

  container.innerHTML = recentVehicles
    .map((vehicle) => {
      const image = safeDashboardImage(
        vehicle.image_url || vehicle.imageUrl || vehicle.image || "",
      );

      return `
        <a
          class="recent-vehicle-card"
          href="./vehicle-form.html?id=${encodeURIComponent(vehicle.id || "")}"
        >
          ${
            image
              ? `
                <img
                  src="${escapeDashboardHtml(image)}"
                  alt="${escapeDashboardHtml(`${vehicle.brand || ""} ${vehicle.model || ""}`.trim())}"
                  loading="lazy"
                  decoding="async"
                >
              `
              : `<div class="recent-vehicle-placeholder"><i class="fa-solid fa-car-side"></i></div>`
          }

          <div>
            <strong>
              ${escapeDashboardHtml(`${vehicle.brand || ""} ${vehicle.model || ""}`.trim() || "Veículo")}
            </strong>

            <span>
              ${escapeDashboardHtml(vehicle.year || "Ano não informado")}
              •
              ${formatCurrency(vehicle.price)}
            </span>
          </div>
        </a>
      `;
    })
    .join("");
}

/* =========================================
   LEADS DA CENTRAL
========================================= */

function renderLeadActions(summary) {
  const container = document.getElementById("leadActionList");

  if (!container) return;

  const openLeads = Number(
    summary.openLeads || summary.totalLeads || summary.pendingLeads || 0,
  );

  const activeProposals = Number(
    summary.activeProposals || summary.openProposals || 0,
  );

  const items = [
    {
      initial: "L",
      title:
        openLeads > 0
          ? `${openLeads} leads para atender`
          : "Nenhum lead atrasado",
      detail: openLeads > 0 ? "Agora" : "Em dia",
      href: "leads.html",
    },
    {
      initial: "P",
      title:
        activeProposals > 0
          ? `${activeProposals} propostas para acompanhar`
          : "Propostas em dia",
      detail: "Hoje",
      href: "proposals.html",
    },
    {
      initial: "I",
      title: "Perguntar para a IA",
      detail: "Copiloto",
      href: "ai.html",
    },
  ];

  container.innerHTML = items
    .map((item) => {
      return `
        <a href="${item.href}">
          <span>${escapeDashboardHtml(item.initial)}</span>
          <strong>${escapeDashboardHtml(item.title)}</strong>
          <em>${escapeDashboardHtml(item.detail)}</em>
        </a>
      `;
    })
    .join("");
}

/* =========================================
   RADAR
========================================= */

function updateRadarTag(id, title, label, state) {
  const element = document.getElementById(id);

  if (!element) return;

  const colors = {
    good: "var(--cc-green, #3ddc7a)",
    warning: "var(--cc-yellow, #ffd235)",
    critical: "var(--cc-red, #ff443a)",
    danger: "var(--cc-red, #ff443a)",
  };

  const color = colors[state] || colors.warning;

  element.innerHTML = `
    <i style="background:${color}"></i>
    ${escapeDashboardHtml(title)}
    <strong style="color:${color}">
      ${escapeDashboardHtml(label)}
    </strong>
  `;
}

function updateRadarFallback(radar) {
  const card =
    document.getElementById("stockRadarCard") ||
    document.querySelector(".radar-card");

  if (!card) return;

  const fallbackMap = [
    [".radar-pending", "Análise da IA"],
    [".radar-visual strong", radar.label],
    [".radar-content h3", radar.title],
    [".radar-content p", radar.description],
  ];

  fallbackMap.forEach(([selector, value]) => {
    const element = card.querySelector(selector);

    if (element) {
      element.textContent = value;
    }
  });

  const tags = card.querySelectorAll(".radar-tags span");

  if (tags[0]) tags[0].textContent = `Estoque · ${radar.stockLabel}`;
  if (tags[1]) tags[1].textContent = `Leads · ${radar.leadsLabel}`;
  if (tags[2]) tags[2].textContent = `Propostas · ${radar.proposalsLabel}`;

  const svg = card.querySelector("svg");

  if (svg) {
    svg.setAttribute("aria-label", `Situação da operação: ${radar.label}`);
  }
}

/* =========================================
   ERRO
========================================= */

function showDashboardError() {
  setText("radarStatusLabel", "Indisponível");
  setText("radarTitle", "Não foi possível avaliar");
  setText(
    "radarDescription",
    "Recarregue a página para tentar novamente. Nenhuma avaliação foi concluída.",
  );

  const radarCard =
    document.getElementById("stockRadarCard") ||
    document.querySelector(".radar-card");

  if (radarCard) {
    radarCard.dataset.state = "unknown";
  }

  ["stockAlerts", "oldVehicles", "recentVehicles"].forEach((id) => {
    const element = document.getElementById(id);

    if (element) {
      element.innerHTML = `
        <div class="empty-card">
          Não foi possível carregar os dados.
        </div>
      `;
    }
  });
}

/* =========================================
   NOTIFICAÇÃO DE NOVO LEAD
========================================= */

let leadNotificationTimeout = null;
let leadStreamReconnectTimeout = null;
let currentLeadStreamIndex = 0;

const leadStreamUrls = ["/leads/stream", "/leads/events/stream"];

function listenForNewLeads() {
  const notification = document.getElementById("leadNotification");

  if (!notification || typeof EventSource === "undefined") return;

  const closeButton = document.getElementById("closeLeadNotification");

  if (closeButton) {
    closeButton.addEventListener("click", hideLeadNotification);
  }

  connectLeadStream();
}

function connectLeadStream() {
  clearTimeout(leadStreamReconnectTimeout);

  const route = leadStreamUrls[currentLeadStreamIndex] || leadStreamUrls[0];

  let source;

  try {
    source = new EventSource(`${API_URL}${route}`, {
      withCredentials: true,
    });
  } catch (error) {
    console.error("Erro ao abrir stream de leads:", error);
    return;
  }

  source.addEventListener("new_lead", (event) => {
    try {
      const { lead } = JSON.parse(event.data);

      showLeadNotification(lead);
    } catch (error) {
      console.error("Erro ao processar notificação de lead:", error);
    }
  });

  source.onerror = () => {
    source.close();

    currentLeadStreamIndex =
      (currentLeadStreamIndex + 1) % leadStreamUrls.length;

    clearTimeout(leadStreamReconnectTimeout);

    leadStreamReconnectTimeout = setTimeout(connectLeadStream, 5000);
  };
}

function showLeadNotification(lead) {
  const notification = document.getElementById("leadNotification");

  if (!notification || !lead) return;

  const nameElement = document.getElementById("leadNotificationName");
  const detailElement = document.getElementById("leadNotificationDetail");
  const actionElement = notification.querySelector(".lead-notification-action");

  if (nameElement) {
    nameElement.textContent = lead.name || "Novo interessado";
  }

  if (detailElement) {
    detailElement.textContent = lead.vehicle_label || sourceLabel(lead.source);
  }

  if (actionElement && lead.id) {
    actionElement.href = `./leads.html?lead=${encodeURIComponent(lead.id)}`;
  }

  notification.hidden = false;
  notification.classList.remove("hidden");

  requestAnimationFrame(() => {
    notification.classList.add("is-visible");
  });

  clearTimeout(leadNotificationTimeout);

  leadNotificationTimeout = setTimeout(hideLeadNotification, 10000);
}

function hideLeadNotification() {
  const notification = document.getElementById("leadNotification");

  if (!notification) return;

  clearTimeout(leadNotificationTimeout);

  notification.classList.remove("is-visible");

  setTimeout(() => {
    notification.hidden = true;
    notification.classList.add("hidden");
  }, 250);
}

function sourceLabel(source) {
  const sources = {
    website: "Site",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    facebook: "Facebook",
    referral: "Indicação",
    walkin: "Visita presencial",
    other: "Outro",
  };

  return sources[source] || "Aguardando informações...";
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

const savedTheme = localStorage.getItem("carDealerAdminTheme") || "dark";

setTheme(savedTheme);

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const isLight = document.body.classList.contains("light-theme");
    const newTheme = isLight ? "dark" : "light";

    localStorage.setItem("carDealerAdminTheme", newTheme);

    setTheme(newTheme);
  });
}

/* =========================================
   FORMATADORES
========================================= */

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

/* =========================================
   UTILITÁRIOS
========================================= */

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function setElementText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function getNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function escapeDashboardHtml(value) {
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

function safeDashboardImage(value) {
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
