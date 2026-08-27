let heroVehicles = [];
let currentHeroVehicle = 0;
let heroChanging = false;

/* =========================================
   CARREGAR VEÍCULOS
========================================= */

async function loadFeaturedVehicles() {
  const container = document.getElementById("featuredVehicles");

  try {
    const response = await fetch(`${API_URL}/vehicles`);

    if (!response.ok) {
      throw new Error("Erro ao buscar veículos.");
    }

    const data = await response.json();

    const vehicles = data.vehicles || [];

    /* =================================
       HERO
    ================================= */

    heroVehicles = vehicles.slice(0, 6);

    if (heroVehicles.length > 0) {
      createHeroNavigation();

      updateHeroVehicle(0, false);
    }

    /* =================================
       VEÍCULOS EM DESTAQUE
    ================================= */

    const featuredVehicles = vehicles.slice(0, 6);

    if (!container) {
      return;
    }

    if (featuredVehicles.length === 0) {
      container.innerHTML = `
        <p class="loading">
          Nenhum veículo disponível no momento.
        </p>
      `;

      return;
    }

    container.innerHTML = featuredVehicles
      .map((vehicle) => {
        const vehicleImage = vehicle.image_url || "";

        const price = Number(vehicle.price).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
        });

        return `
            <article class="vehicle-card">

              <div class="vehicle-card-image">

                ${
                  vehicleImage
                    ? `
                      <img
                        src="${vehicleImage}"
                        alt="${vehicle.brand} ${vehicle.model}"
                      >
                    `
                    : `
                      <div class="vehicle-no-image">
                        Sem imagem
                      </div>
                    `
                }

              </div>


              <div class="vehicle-info">

                <h3>
                  ${vehicle.brand}
                  ${vehicle.model}
                </h3>


                <p>
                  ${vehicle.year}
                </p>


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
  } catch (error) {
    console.error("Erro ao carregar veículos:", error);

    if (container) {
      container.innerHTML = `
        <p class="loading">
          Não foi possível carregar os veículos.
        </p>
      `;
    }
  }
}

/* =========================================
   CRIAR NAVEGAÇÃO DO HERO
========================================= */

function createHeroNavigation() {
  const navigation = document.getElementById("heroSliderNav");

  if (!navigation) {
    return;
  }

  navigation.innerHTML = heroVehicles
    .map((vehicle, index) => {
      const number = String(index + 1).padStart(2, "0");

      return `
          <div
            class="hero-nav-item ${index === 0 ? "active" : ""}"
            data-index="${index}"
          >

            <span>
              ${number}
            </span>

          </div>
        `;
    })
    .join("");

  document.querySelectorAll(".hero-nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      const index = Number(item.dataset.index);

      updateHeroVehicle(index);
    });
  });
}

/* =========================================
   ALTERAR VEÍCULO DO HERO
========================================= */

function updateHeroVehicle(index, animate = true) {
  if (!heroVehicles.length || index < 0 || index >= heroVehicles.length) {
    return;
  }

  if (heroChanging) {
    return;
  }

  const hero = document.querySelector(".hero-showcase");

  const vehicle = heroVehicles[index];

  if (!hero || !vehicle) {
    return;
  }

  heroChanging = true;

  if (animate) {
    hero.classList.add("changing");
  }

  setTimeout(
    () => {
      /* ANO */

      const heroYear = document.getElementById("heroYear");

      if (heroYear) {
        heroYear.textContent = vehicle.year || "----";
      }

      /* TÍTULO */

      const heroTitle = document.getElementById("heroTitle");

      if (heroTitle) {
        heroTitle.textContent = `${vehicle.brand || ""} ${vehicle.model || ""}`;
      }

      /* DESCRIÇÃO */

      const heroDescription = document.getElementById("heroDescription");

      if (heroDescription) {
        heroDescription.textContent =
          vehicle.description ||
          "Conheça este veículo disponível no nosso estoque.";
      }

      /* PREÇO */

      const heroPrice = document.getElementById("heroPrice");

      if (heroPrice) {
        heroPrice.textContent = `R$ ${Number(vehicle.price || 0).toLocaleString(
          "pt-BR",
          {
            minimumFractionDigits: 2,
          },
        )}`;
      }

      /* TOP SPEED */

      const heroTopSpeed = document.getElementById("heroTopSpeed");

      if (heroTopSpeed) {
        heroTopSpeed.textContent = vehicle.top_speed
          ? `${vehicle.top_speed} KM/H`
          : "Não informado";
      }

      /* ASSENTOS */

      const heroSeats = document.getElementById("heroSeats");

      if (heroSeats) {
        heroSeats.textContent = vehicle.seats || "Não informado";
      }

      /* LINK */

      const heroDetailsButton = document.getElementById("heroDetailsButton");

      if (heroDetailsButton) {
        heroDetailsButton.href = `./vehicle.html?id=${vehicle.id}`;
      }

      /* IMAGEM */

      const image = document.getElementById("heroVehicleImage");

      if (image) {
        if (vehicle.image_url) {
          image.src = vehicle.image_url;

          image.alt = `${vehicle.brand || ""} ${vehicle.model || ""}`;

          image.style.display = "block";
        } else {
          image.removeAttribute("src");

          image.alt = "Veículo sem imagem";

          image.style.display = "none";
        }
      }

      /* NAVEGAÇÃO */

      document.querySelectorAll(".hero-nav-item").forEach((item, itemIndex) => {
        item.classList.toggle("active", itemIndex === index);
      });

      currentHeroVehicle = index;

      hero.classList.remove("changing");

      setTimeout(() => {
        heroChanging = false;
      }, 450);
    },
    animate ? 350 : 0,
  );
}

/* =========================================
   ROLAGEM DO HERO
========================================= */

const hero = document.querySelector(".hero-showcase");

if (hero) {
  hero.addEventListener(
    "wheel",
    (event) => {
      if (heroChanging) {
        return;
      }

      if (Math.abs(event.deltaY) < 15) {
        return;
      }

      if (event.deltaY > 0) {
        /*
          PRÓXIMO
        */

        if (currentHeroVehicle < heroVehicles.length - 1) {
          event.preventDefault();

          updateHeroVehicle(currentHeroVehicle + 1);
        }
      } else {
        /*
          ANTERIOR
        */

        if (currentHeroVehicle > 0) {
          event.preventDefault();

          updateHeroVehicle(currentHeroVehicle - 1);
        }
      }
    },
    {
      passive: false,
    },
  );
}

/* =========================================
   INICIAR
========================================= */

loadFeaturedVehicles();
