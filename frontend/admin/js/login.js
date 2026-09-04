
const form = document.getElementById("loginForm");
const button = document.getElementById("loginButton");
const message = document.getElementById("loginMessage");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    clearMessage();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    button.disabled = true;
    button.textContent = "Entrando...";

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                password
            })
        });

        let data = {};

        try {
            data = await response.json();
        } catch (parseError) {
            // Resposta sem corpo (ex.: instância acordando no Render)
        }

        if (!response.ok) {
            throw new Error(
                data.error ||
                    "Não foi possível realizar o login. Tente novamente em instantes."
            );
        }

        window.location.href = "./index.html";

    } catch (error) {
        console.error(error);

        showMessage(error.message, "error");
    } finally {
        button.disabled = false;
        button.textContent = "Entrar";
    }
});

function showMessage(text, type) {
    message.textContent = text;
    message.className = `form-message ${type}`;
}

function clearMessage() {
    message.textContent = "";
    message.className = "form-message";
}