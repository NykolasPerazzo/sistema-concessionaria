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

// ==========================================
// USUÁRIOS (ABA SEGURANÇA)
// ==========================================

const ROLE_LABELS = {
  admin: "Administrador",
  vendedor: "Vendedor",
  despachante: "Despachante",
  financeiro: "Financeiro",
};

const newUserName = document.getElementById("newUserName");
const newUserEmail = document.getElementById("newUserEmail");
const newUserPassword = document.getElementById("newUserPassword");
const newUserRole = document.getElementById("newUserRole");
const createUserButton = document.getElementById("createUserButton");
const userFormMessage = document.getElementById("userFormMessage");
const usersTableBody = document.getElementById("usersTableBody");

let currentUserId = null;

// Impede que Enter num campo da seção de usuários envie o formulário
// de configurações inteiro (eles compartilham o mesmo <form>).
[newUserName, newUserEmail, newUserPassword].forEach((field) => {
  field?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      createUser();
    }
  });
});

function showUserFormMessage(message, type) {
  if (!userFormMessage) return;
  userFormMessage.textContent = message;
  userFormMessage.className = `form-message ${type || ""}`.trim();
}

async function loadUsers() {
  if (!usersTableBody) return;

  try {
    const response = await fetch(`${API_URL}/users/all`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Não foi possível carregar os usuários.");
    }

    const data = await response.json();
    const users = data.users || [];

    if (users.length === 0) {
      usersTableBody.innerHTML = `<tr><td colspan="4">Nenhum usuário cadastrado.</td></tr>`;
      return;
    }

    usersTableBody.innerHTML = users
      .map((user) => {
        const isSelf = user.id === currentUserId;

        return `
          <tr>
            <td>${escapeHtml(user.name)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>${escapeHtml(ROLE_LABELS[user.role] || user.role)}</td>
            <td>
              ${
                isSelf
                  ? ""
                  : `<button type="button" class="table-action danger" data-delete-user="${user.id}">Excluir</button>`
              }
            </td>
          </tr>
        `;
      })
      .join("");

    usersTableBody.querySelectorAll("[data-delete-user]").forEach((button) => {
      button.addEventListener("click", () => {
        deleteUser(Number(button.dataset.deleteUser));
      });
    });
  } catch (error) {
    console.error(error);
    usersTableBody.innerHTML = `<tr><td colspan="4">Erro ao carregar usuários.</td></tr>`;
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

async function createUser() {
  const name = newUserName.value.trim();
  const email = newUserEmail.value.trim();
  const password = newUserPassword.value;
  const role = newUserRole.value;

  if (!name || !email || !password) {
    showUserFormMessage("Preencha nome, e-mail e senha.", "error");
    return;
  }

  if (password.length < 8) {
    showUserFormMessage("A senha precisa ter pelo menos 8 caracteres.", "error");
    return;
  }

  try {
    createUserButton.disabled = true;
    showUserFormMessage("Criando usuário...", "");

    const response = await fetch(`${API_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, email, password, role }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível criar o usuário.");
    }

    showUserFormMessage("Usuário criado com sucesso.", "success");

    newUserName.value = "";
    newUserEmail.value = "";
    newUserPassword.value = "";
    newUserRole.value = "admin";

    loadUsers();
  } catch (error) {
    console.error(error);
    showUserFormMessage(error.message || "Erro ao criar usuário.", "error");
  } finally {
    createUserButton.disabled = false;
  }
}

async function deleteUser(id) {
  if (!confirm("Tem certeza que deseja excluir este usuário? Essa ação não pode ser desfeita.")) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/users/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível excluir o usuário.");
    }

    loadUsers();
  } catch (error) {
    console.error(error);
    alert(error.message || "Erro ao excluir usuário.");
  }
}

createUserButton?.addEventListener("click", createUser);

(async () => {
  try {
    const meResponse = await fetch(`${API_URL}/auth/me`, {
      credentials: "include",
    });

    if (meResponse.ok) {
      const meData = await meResponse.json();
      currentUserId = meData.user?.id ?? null;
    }
  } catch (error) {
    console.error(error);
  } finally {
    loadUsers();
  }
})();

loadSettings();
