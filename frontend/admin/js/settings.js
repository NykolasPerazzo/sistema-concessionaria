const settingsForm = document.getElementById("settingsForm");
const settingsMessage = document.getElementById("settingsMessage");

const tabs = document.querySelectorAll(".settings-tab");
const sections = document.querySelectorAll(".settings-section");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.section;

    tabs.forEach((item) => {
      item.classList.remove("active");
    });

    sections.forEach((section) => {
      section.classList.remove("active");
    });

    tab.classList.add("active");

    document.getElementById(target)?.classList.add("active");
  });
});

const primaryColor = document.getElementById("primary_color");
const secondaryColor = document.getElementById("secondary_color");

primaryColor.addEventListener("input", () => {
  document.getElementById("primaryColorValue").textContent = primaryColor.value;
});

secondaryColor.addEventListener("input", () => {
  document.getElementById("secondaryColorValue").textContent =
    secondaryColor.value;
});

async function loadSettings() {
  try {
    const response = await fetch(`${API_URL}/settings`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Não foi possível carregar as configurações.");
    }

    const data = await response.json();

    const settings = data.settings || {};

    Object.entries(settings).forEach(([key, value]) => {
      const field = document.getElementById(key);

      if (!field) {
        return;
      }

      if (field.type === "checkbox") {
        field.checked = value === true || value === "true";
      } else {
        field.value = value ?? "";
      }
    });

    document.getElementById("primaryColorValue").textContent =
      primaryColor.value;

    document.getElementById("secondaryColorValue").textContent =
      secondaryColor.value;
  } catch (error) {
    console.error(error);

    showMessage("Erro ao carregar configurações.", "error");
  }
}

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const settings = {
    company_name: document.getElementById("company_name").value.trim(),

    company_cnpj: document.getElementById("company_cnpj").value.trim(),

    company_phone: document.getElementById("company_phone").value.trim(),

    company_whatsapp: document.getElementById("company_whatsapp").value.trim(),

    company_email: document.getElementById("company_email").value.trim(),

    company_city: document.getElementById("company_city").value.trim(),

    primary_color: document.getElementById("primary_color").value,

    secondary_color: document.getElementById("secondary_color").value,

    site_theme: document.getElementById("site_theme").value,

    site_title: document.getElementById("site_title").value.trim(),

    instagram_url: document.getElementById("instagram_url").value.trim(),

    site_description: document.getElementById("site_description").value.trim(),

    stock_alert_days: Number(document.getElementById("stock_alert_days").value),

    featured_limit: Number(document.getElementById("featured_limit").value),

    monthly_goal: Number(document.getElementById("monthly_goal").value),

    ai_enabled: document.getElementById("ai_enabled").checked,

    ai_welcome_message: document
      .getElementById("ai_welcome_message")
      .value.trim(),
  };

  try {
    showMessage("Salvando...", "");

    const response = await fetch(`${API_URL}/settings`, {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
      },

      credentials: "include",

      body: JSON.stringify(settings),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Não foi possível salvar.");
    }

    showMessage("Configurações salvas com sucesso.", "success");
  } catch (error) {
    console.error(error);

    showMessage(error.message || "Erro ao salvar configurações.", "error");
  }
});

function showMessage(message, type) {
  settingsMessage.textContent = message;
  settingsMessage.className = type || "";
}

loadSettings();
