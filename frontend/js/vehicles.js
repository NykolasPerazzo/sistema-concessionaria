let vehicles = [];

const vehiclesGrid = document.getElementById("vehiclesGrid");

const searchInput = document.getElementById("searchInput");

const brandFilter = document.getElementById("brandFilter");

const yearFilter = document.getElementById("yearFilter");

const vehicleCount = document.getElementById("vehicleCount");

/* =========================================
   CARREGAR VEÍCULOS
========================================= */

async function loadVehicles() {
  try {
    const response = await fetch(`${API_URL}/vehicles`);

    if (!response.ok) {
      throw new Error("Erro ao carregar veículos.");
    }

    const data = await response.json();

    vehicles = (data.vehicles || []).filter(vehicle => vehicle.status !== "sold");

    populateFilters();

    renderVehicles();
  } catch (error) {
    console.error("Erro ao carregar veículos:", error);

    vehiclesGrid.innerHTML = `
      <p class="loading">
        Não foi possível carregar os veículos.
      </p>
    `;
  }
}

/* =========================================
   PREENCHER FILTROS
========================================= */

function populateFilters() {
  /*
    Limpa opções anteriores para evitar
    duplicação caso loadVehicles seja
    executado mais de uma vez.
  */

  brandFilter.innerHTML = `
    <option value="">
      Todas as marcas
    </option>
  `;

  yearFilter.innerHTML = `
    <option value="">
      Todos os anos
    </option>
  `;

  const brands = [
    ...new Set(vehicles.map((vehicle) => vehicle.brand).filter(Boolean)),
  ].sort();

  const years = [
    ...new Set(vehicles.map((vehicle) => vehicle.year).filter(Boolean)),
  ].sort((a, b) => b - a);

  brands.forEach((brand) => {
    const option = document.createElement("option");

    option.value = brand;

    option.textContent = brand;

    brandFilter.appendChild(option);
  });

  years.forEach((year) => {
    const option = document.createElement("option");

    option.value = year;

    option.textContent = year;

    yearFilter.appendChild(option);
  });
}

/* =========================================
   RENDERIZAR VEÍCULOS
========================================= */

function renderVehicles() {
  const search = searchInput.value.toLowerCase().trim();

  const brand = brandFilter.value;

  const year = yearFilter.value;

  const filteredVehicles = vehicles.filter((vehicle) => {
    const vehicleBrand = String(vehicle.brand || "").toLowerCase();

    const vehicleModel = String(vehicle.model || "").toLowerCase();

    const matchesSearch =
      vehicleBrand.includes(search) || vehicleModel.includes(search);

    const matchesBrand = !brand || vehicle.brand === brand;

    const matchesYear = !year || String(vehicle.year) === year;

    return matchesSearch && matchesBrand && matchesYear;
  });

  /* CONTADOR */

  vehicleCount.textContent = `${filteredVehicles.length} veículo${
    filteredVehicles.length !== 1 ? "s" : ""
  }`;

  /* SEM RESULTADOS */

  if (filteredVehicles.length === 0) {
    vehiclesGrid.innerHTML = `
      <p class="loading">
        Nenhum veículo encontrado.
      </p>
    `;

    return;
  }

  /* CARDS */

  vehiclesGrid.innerHTML = filteredVehicles
    .map((vehicle) => {
      const price = Number(vehicle.price || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      const vehicleImage = vehicle.image_url || null;

      return `
          <article class="vehicle-card">

            <div class="vehicle-card-image">

              ${
                vehicleImage
                  ? `
                    <img
                      src="${vehicleImage}"
                      alt="${vehicle.brand || ""} ${vehicle.model || ""}"
                      loading="lazy"
                    >
                  `
                  : `
                    <div class="vehicle-no-image">
                      <span>🚗</span>
                      <p>Sem imagem</p>
                    </div>
                  `
              }

            </div>


            <div class="vehicle-info">

              <span class="section-label">
                ${vehicle.year || "Ano não informado"}
              </span>


              <h3>
                ${vehicle.brand || ""}
                ${vehicle.model || ""}
              </h3>


              <div class="vehicle-price">
                R$ ${price}
              </div>


              <a
                class="vehicle-link"
                href="./vehicle.html?id=${vehicle.id}"
              >
                Ver detalhes →
              </a>

            </div>

          </article>
        `;
    })
    .join("");
}

/* =========================================
   EVENTOS
========================================= */

searchInput.addEventListener("input", renderVehicles);

brandFilter.addEventListener("change", renderVehicles);

yearFilter.addEventListener("change", renderVehicles);

/* =========================================
   INICIAR
========================================= */

loadVehicles();
