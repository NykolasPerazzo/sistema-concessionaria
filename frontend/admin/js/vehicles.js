
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
    const brands = [...new Set(
        vehicles.map(vehicle => vehicle.brand)
    )].sort();

    brandFilter.innerHTML = `
        <option value="">Todas as marcas</option>
    `;

    brands.forEach(brand => {
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

    const filteredVehicles = vehicles.filter(vehicle => {

        const matchesSearch =
            vehicle.brand.toLowerCase().includes(search) ||
            vehicle.model.toLowerCase().includes(search);

        const matchesStatus =
            !status || vehicle.status === status;

        const matchesBrand =
            !brand || vehicle.brand === brand;

        return matchesSearch &&
            matchesStatus &&
            matchesBrand;
    });

    vehicleCount.textContent =
        `${filteredVehicles.length} veículo${filteredVehicles.length !== 1 ? "s" : ""}`;

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

    tableBody.innerHTML = filteredVehicles.map(vehicle => {

        const price = Number(vehicle.price).toLocaleString(
            "pt-BR",
            {
                style: "currency",
                currency: "BRL"
            }
        );

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

    }).join("");
}


async function deleteVehicle(id) {

    const vehicle = vehicles.find(
        vehicle => vehicle.id === id
    );

    if (!vehicle) {
        return;
    }

    const confirmed = confirm(
        `Deseja realmente excluir ${vehicle.brand} ${vehicle.model}?`
    );

    if (!confirmed) {
        return;
    }

    try {

        const response = await fetch(
            `${API_URL}/vehicles/${id}`,
            {
                method: "DELETE"
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Erro ao excluir veículo."
            );
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
        sold: "Vendido"
    };

    return statuses[status] || "Sem status";
}


searchInput.addEventListener("input", renderVehicles);

statusFilter.addEventListener("change", renderVehicles);

brandFilter.addEventListener("change", renderVehicles);

