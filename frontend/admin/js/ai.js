let aiVehicles = [];

const aiChatMessages = document.getElementById("aiChatMessages");

const aiPageQuestion = document.getElementById("aiPageQuestion");

const aiPageSend = document.getElementById("aiPageSend");

requireAuth().then((user) => {
  if (!user) {
    return;
  }

  loadAIPageData();
});

async function loadAIPageData() {
  try {
    const response = await fetch(`${API_URL}/vehicles`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Não foi possível carregar os veículos.");
    }

    const data = await response.json();

    aiVehicles = data.vehicles || [];

    updateAIPageInsights();
  } catch (error) {
    console.error("Erro ao carregar dados da IA:", error);
  }
}

/* ==========================================
   INSIGHTS
========================================== */

function updateAIPageInsights() {
  calculateHighestMargin();

  calculateOldestVehicle();

  calculateStockValue();
}

/* ==========================================
   MAIOR MARGEM
========================================== */

function calculateHighestMargin() {
  const name = document.getElementById("aiPageHighestMargin");

  const value = document.getElementById("aiPageHighestMarginValue");

  const vehiclesWithMargin = aiVehicles
    .filter((vehicle) => {
      return (
        Number(vehicle.purchase_price) > 0 &&
        Number(vehicle.price) > 0 &&
        vehicle.status !== "sold"
      );
    })
    .map((vehicle) => {
      const margin =
        ((Number(vehicle.price) - Number(vehicle.purchase_price)) /
          Number(vehicle.purchase_price)) *
        100;

      return {
        ...vehicle,
        calculatedMargin: margin,
      };
    })
    .sort((a, b) => b.calculatedMargin - a.calculatedMargin);

  if (!vehiclesWithMargin.length) {
    name.textContent = "Sem dados";

    value.textContent = "Cadastre o valor de compra";

    return;
  }

  const vehicle = vehiclesWithMargin[0];

  name.textContent = `${vehicle.brand} ${vehicle.model}`;

  value.textContent = `${vehicle.calculatedMargin.toFixed(1)}%`;
}

/* ==========================================
   MAIS TEMPO EM ESTOQUE
========================================== */

function calculateOldestVehicle() {
  const name = document.getElementById("aiPageOldestVehicle");

  const daysElement = document.getElementById("aiPageOldestDays");

  const today = new Date();

  const vehiclesWithEntryDate = aiVehicles
    .filter((vehicle) => {
      return vehicle.entry_date && vehicle.status !== "sold";
    })
    .map((vehicle) => {
      const entryDate = new Date(vehicle.entry_date);

      const days = Math.max(0, Math.floor((today - entryDate) / 86400000));

      return {
        ...vehicle,
        daysInStock: days,
      };
    })
    .sort((a, b) => b.daysInStock - a.daysInStock);

  if (!vehiclesWithEntryDate.length) {
    name.textContent = "Sem dados";

    daysElement.textContent = "-";

    return;
  }

  const vehicle = vehiclesWithEntryDate[0];

  name.textContent = `${vehicle.brand} ${vehicle.model}`;

  daysElement.textContent = `${vehicle.daysInStock} dias`;
}

/* ==========================================
   VALOR TOTAL DO ESTOQUE
========================================== */

function calculateStockValue() {
  const element = document.getElementById("aiPageStockValue");

  const total = aiVehicles
    .filter((vehicle) => vehicle.status !== "sold")
    .reduce((sum, vehicle) => sum + Number(vehicle.price || 0), 0);

  element.textContent = total.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/* ==========================================
   CONVERSA COM IA
========================================== */

async function askAI(question) {
  const text = question.trim();

  if (!text) {
    return;
  }

  addUserMessage(text);

  aiPageQuestion.value = "";

  aiPageSend.disabled = true;

  const loadingMessage = addLoadingMessage();

  try {
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

    loadingMessage.remove();

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível consultar a IA.");
    }

    addAssistantMessage(data.answer);
  } catch (error) {
    loadingMessage.remove();

    addAssistantMessage(
      "Não consegui analisar os dados agora. Tente novamente.",
    );

    console.error("Erro IA:", error);
  } finally {
    aiPageSend.disabled = false;

    aiPageQuestion.focus();
  }
}

/* ==========================================
   MENSAGEM DO USUÁRIO
========================================== */

function addUserMessage(text) {
  const message = document.createElement("div");

  message.className = "ai-message user";

  const content = document.createElement("div");

  content.className = "ai-message-content";

  const paragraph = document.createElement("p");

  paragraph.textContent = text;

  content.appendChild(paragraph);

  message.appendChild(content);

  aiChatMessages.appendChild(message);

  scrollChat();
}

/* ==========================================
   MENSAGEM DA IA
========================================== */

function addAssistantMessage(text) {
  const message = document.createElement("div");

  message.className = "ai-message assistant";

  const avatar = document.createElement("div");

  avatar.className = "ai-message-avatar";

  avatar.textContent = "✦";

  const content = document.createElement("div");

  content.className = "ai-message-content";

  const name = document.createElement("strong");

  name.textContent = "Car Dealer IA";

  const paragraph = document.createElement("p");

  paragraph.textContent = text;

  content.appendChild(name);

  content.appendChild(paragraph);

  message.appendChild(avatar);

  message.appendChild(content);

  aiChatMessages.appendChild(message);

  scrollChat();
}

/* ==========================================
   LOADING
========================================== */

function addLoadingMessage() {
  const message = document.createElement("div");

  message.className = "ai-message assistant ai-loading-message";

  const avatar = document.createElement("div");

  avatar.className = "ai-message-avatar";

  avatar.textContent = "✦";

  const content = document.createElement("div");

  content.className = "ai-message-content";

  const paragraph = document.createElement("p");

  paragraph.textContent = "Analisando seu estoque...";

  content.appendChild(paragraph);

  message.appendChild(avatar);

  message.appendChild(content);

  aiChatMessages.appendChild(message);

  scrollChat();

  return message;
}

/* ==========================================
   SCROLL
========================================== */

function scrollChat() {
  aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
}

/* ==========================================
   EVENTOS
========================================== */

aiPageSend.addEventListener("click", () => {
  askAI(aiPageQuestion.value);
});

aiPageQuestion.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();

    askAI(aiPageQuestion.value);
  }
});

document.querySelectorAll(".ai-chat-suggestions button").forEach((button) => {
  button.addEventListener("click", () => {
    askAI(button.textContent.trim());
  });
});
