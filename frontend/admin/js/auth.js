async function requireAuth() {
    try {
        const response = await fetch(
            `${API_URL}/auth/me`,
            {
                credentials: "include"
            }
        );

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