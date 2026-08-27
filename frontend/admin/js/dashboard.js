requireAuth().then((user) => {
    if (!user) {
        return;
    }

    loadDashboard();
});

async function loadDashboard() {
    try {
        const response = await fetch(`${API_URL}/vehicles`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(
                `Não foi possível carregar os veículos. Status: ${response.status}`
            );
        }

        const data = await response.json();

        console.log("Veículos recebidos:", data);

        const vehicles = data.vehicles;

        updateStats(vehicles);
        renderRecentVehicles(vehicles);

    } catch (error) {
        console.error(error);

        document.getElementById("recentVehicles").innerHTML = `
            <p class="error">
                Não foi possível carregar os dados.
            </p>
        `;
    }
}

function updateStats(vehicles) {
    const available = vehicles.filter(
        vehicle => vehicle.status === "available"
    ).length;

    const reserved = vehicles.filter(
        vehicle => vehicle.status === "reserved"
    ).length;

    const sold = vehicles.filter(
        vehicle => vehicle.status === "sold"
    ).length;

    document.getElementById("totalVehicles").textContent =
        vehicles.length;

    document.getElementById("availableVehicles").textContent =
        available;

    document.getElementById("reservedVehicles").textContent =
        reserved;

    document.getElementById("soldVehicles").textContent =
        sold;
}

function renderRecentVehicles(vehicles) {
    const container = document.getElementById("recentVehicles");

    if (vehicles.length === 0) {
        container.innerHTML = `
            <p class="loading">
                Nenhum veículo cadastrado.
            </p>
        `;
        return;
    }

    const recentVehicles = [...vehicles]
        .sort((a, b) => b.id - a.id)
        .slice(0, 6);

    container.innerHTML = recentVehicles.map(vehicle => {

        const price = Number(vehicle.price).toLocaleString(
            "pt-BR",
            {
                style: "currency",
                currency: "BRL"
            }
        );

        const status = formatStatus(vehicle.status);

        return `
            <div class="vehicle-row">

                <div class="vehicle-main">

                    <strong>
                        ${vehicle.brand} ${vehicle.model}
                    </strong>

                    <span>
                        ${vehicle.year} • ${vehicle.mileage
                            ? Number(vehicle.mileage).toLocaleString("pt-BR") + " km"
                            : "Quilometragem não informada"
                        }
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

    }).join("");
}

function formatStatus(status) {
    const statuses = {
        available: "Disponível",
        reserved: "Reservado",
        sold: "Vendido"
    };

    return statuses[status] || "Sem status";
}

