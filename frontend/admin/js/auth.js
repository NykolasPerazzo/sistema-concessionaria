async function requireAuth() {
  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      credentials: "include",
    });

    if (!response.ok) {
      window.location.href = "./login.html";
      return null;
    }

    const data = await response.json();

    return data.user;
  } catch (error) {
    console.error(error);

    window.location.href = "./login.html";
    return null;
  }
}

// ==========================
// LOGOUT
// ==========================

async function logout() {
  try {
    const response = await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Erro ao realizar logout.");
    }

    window.location.href = "./login.html";
  } catch (error) {
    console.error("Erro no logout:", error);

    alert("Não foi possível sair.");
  }
}

const logoutButton = document.getElementById("logoutButton");

if (logoutButton) {
  logoutButton.addEventListener("click", logout);
}

// ==========================
// TEMA CLARO / ESCURO
// ==========================

function setTheme(theme) {
  const isLight = theme === "light";

  document.body.classList.toggle("light-theme", isLight);

  const themeIcon = document.getElementById("themeIcon");

  if (themeIcon) {
    themeIcon.className = isLight ? "fa-regular fa-sun" : "fa-regular fa-moon";
  }
}

setTheme(localStorage.getItem("carDealerAdminTheme") || "dark");

const themeToggle = document.getElementById("themeToggle");

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const newTheme = document.body.classList.contains("light-theme")
      ? "dark"
      : "light";

    localStorage.setItem("carDealerAdminTheme", newTheme);
    setTheme(newTheme);
  });
}
