let publicSettings = {};
let heroVehicles = [];

let currentHeroVehicle = 0;

let heroChanging = false;

/* =========================================
   UTILIDADES
========================================= */

function formatPrice(value) {
  const price = Number(value || 0);

  return price.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getVehicleImage(vehicle) {
  return vehicle.image_url || vehicle.main_image || vehicle.image || "";
}

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

    const vehicles = (data.vehicles || []).filter(vehicle => vehicle.status !== "sold");

    /* HERO */

    heroVehicles = vehicles.slice(0, 6);
    const heroSection = document.querySelector(".hero-showcase");
    if (heroSection) heroSection.style.display = heroVehicles.length ? "" : "none";

    if (heroVehicles.length) {
      createHeroNavigation();

      updateHeroVehicle(0, false);
    }

    /* ESTOQUE */

    if (!container) {
      return;
    }

    const featuredVehicles = vehicles.slice(0, 6);

    if (!featuredVehicles.length) {
      container.innerHTML = `

        <p class="loading">

          Nenhum veículo disponível.

        </p>

      `;

      return;
    }

    container.innerHTML = featuredVehicles
      .map((vehicle) => {
        const image = getVehicleImage(vehicle);

        return `

            <article class="vehicle-card">

              <div class="vehicle-card-image">

                ${
                  image
                    ? `

                      <img
                        src="${image}"
                        alt="${vehicle.brand} ${vehicle.model}"
                        loading="lazy"
                      >

                    `
                    : `

                      <div class="vehicle-no-image">

                        <span>
                          CAR DEALER IA
                        </span>

                        <strong>
                          Sem imagem
                        </strong>

                      </div>

                    `
                }

              </div>


              <div class="vehicle-info">

                <span class="vehicle-card-brand">

                  ${vehicle.brand || ""}

                </span>


                <h3>

                  ${vehicle.model || ""}

                </h3>


                <div class="vehicle-card-meta">

                  <span>

                    ${vehicle.year || ""}

                  </span>

                  <strong>

                    ${formatPrice(vehicle.price)}

                  </strong>

                </div>


                <a
                  href="./vehicle.html?id=${vehicle.id}"
                  class="vehicle-link"
                >

                  VER VEÍCULO →

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
   NAVEGAÇÃO HERO
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

          <button
            type="button"
            class="hero-nav-item
            ${index === 0 ? "active" : ""}"
            data-index="${index}"
            aria-label="Mostrar veículo ${number}"
          >

            <span>
              ${number}
            </span>

          </button>

        `;
    })
    .join("");

  navigation.querySelectorAll(".hero-nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      const index = Number(item.dataset.index);

      updateHeroVehicle(index);
    });
  });
}

/* =========================================
   ALTERAR HERO
========================================= */

function updateHeroVehicle(index, animate = true) {
  if (
    heroChanging ||
    !heroVehicles.length ||
    index < 0 ||
    index >= heroVehicles.length
  ) {
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
      updateHeroContent(vehicle);

      currentHeroVehicle = index;

      updateHeroNavigation(index);

      hero.classList.remove("changing");

      setTimeout(() => {
        heroChanging = false;
      }, 500);
    },

    animate ? 320 : 0,
  );
}

/* =========================================
   CONTEÚDO DO HERO
========================================= */

function updateHeroContent(vehicle) {
  const year = document.getElementById("heroYear");

  const brand = document.getElementById("heroBrand");

  const model = document.getElementById("heroModel");

  const description = document.getElementById("heroDescription");

  const price = document.getElementById("heroPrice");

  const speed = document.getElementById("heroTopSpeed");

  const seats = document.getElementById("heroSeats");

  const details = document.getElementById("heroDetailsButton");

  const image = document.getElementById("heroVehicleImage");

  const noImage = document.getElementById("heroNoImage");

  const background = document.getElementById("heroCarBackground");

  const vehicleImage = getVehicleImage(vehicle);

  /* ANO */

  if (year) {
    year.textContent = vehicle.year || "----";
  }

  /* MARCA */

  if (brand) {
    brand.textContent = vehicle.brand || "CAR DEALER";
  }

  /* MODELO */

  if (model) {
    model.textContent = vehicle.model || "VEÍCULO";
  }

  /* DESCRIÇÃO */

  if (description) {
    description.textContent =
      vehicle.description ||
      "Descubra todos os detalhes deste veículo disponível em nosso estoque.";
  }

  /* PREÇO */

  if (price) {
    price.textContent = formatPrice(vehicle.price);
  }

  /* VELOCIDADE */

  if (speed) {
    speed.textContent = vehicle.top_speed ? `${vehicle.top_speed} KM/H` : "—";
  }

  /* ASSENTOS */

  if (seats) {
    seats.textContent = vehicle.seats ? `${vehicle.seats} LUGARES` : "—";
  }

  /* LINK */

  if (details) {
    details.href = `./vehicle.html?id=${vehicle.id}`;
  }

  /* IMAGEM */

  if (vehicleImage && image) {
    image.src = vehicleImage;

    image.alt = `${vehicle.brand || ""} ${vehicle.model || ""}`;

    image.hidden = false;

    if (noImage) {
      noImage.style.display = "none";
    }

    if (background) {
      background.style.backgroundImage = `url("${vehicleImage}")`;
    }
  } else {
    if (image) {
      image.hidden = true;

      image.removeAttribute("src");
    }

    if (noImage) {
      noImage.style.display = "flex";
    }

    if (background) {
      background.style.backgroundImage = "none";
    }
  }
}

/* =========================================
   ATUALIZAR INDICADOR
========================================= */

function updateHeroNavigation(index) {
  document.querySelectorAll(".hero-nav-item").forEach((item, itemIndex) => {
    item.classList.toggle("active", itemIndex === index);
  });
}

/* =========================================
   SCROLL HERO
========================================= */

const hero = document.querySelector(".hero-showcase");

if (hero) {
  hero.addEventListener(
    "wheel",
    (event) => {
      if (heroChanging || !heroVehicles.length) {
        return;
      }

      if (Math.abs(event.deltaY) < 20) {
        return;
      }

      /* DESCENDO */

      if (event.deltaY > 0) {
        if (currentHeroVehicle < heroVehicles.length - 1) {
          event.preventDefault();

          updateHeroVehicle(currentHeroVehicle + 1);
        }
      } else {
        /* SUBINDO */
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
   BUSCA DA HOME
========================================= */

const searchButton = document.getElementById("searchButton");

const searchInput = document.getElementById("searchInput");

if (searchButton && searchInput) {
  searchButton.addEventListener("click", (event) => {
    const search = searchInput.value.trim();

    if (!search) {
      return;
    }

    event.preventDefault();

    window.location.href = `./vehicles.html?search=${encodeURIComponent(search)}`;
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      searchButton.click();
    }
  });
}

/* =========================================
   INICIAR
========================================= */

/* =========================================
   CONFIGURAÇÕES PÚBLICAS
========================================= */

async function loadPublicSettings() {
  try {
    const response = await fetch(`${API_URL}/settings/public`);

    if (!response.ok) {
      throw new Error("Não foi possível carregar as configurações.");
    }

    const data = await response.json();

    publicSettings = data.settings || {};

    applyPublicSettings();
  } catch (error) {
    console.error("Erro ao carregar configurações públicas:", error);
  }
}

/* =========================================
   APLICAR CONFIGURAÇÕES
========================================= */

function applyPublicSettings() {
  const settings = publicSettings;

  /* NOME DA EMPRESA */

  if (settings.company_name) {
    document.querySelectorAll(".logo-text").forEach((element) => {
      element.textContent = settings.company_name.toUpperCase();
    });
  }

  /* TÍTULO DA ABA */

  if (settings.company_name) {
    document.title = `${settings.company_name} | Veículos`;
  }

  /* COR PRINCIPAL */

  if (settings.primary_color) {
    document.documentElement.style.setProperty(
      "--color-accent",
      settings.primary_color,
    );
  }

  /* WHATSAPP */

  if (settings.company_whatsapp) {
    const whatsapp = settings.company_whatsapp.replace(/\D/g, "");

    document.querySelectorAll("[data-whatsapp]").forEach((element) => {
      element.href = `https://wa.me/55${whatsapp}`;
    });
  }

  /* IA */

  if (settings.ai_enabled === false) {
    document
      .querySelectorAll("#heroAiButton, #findVehicleAiButton")
      .forEach((element) => {
        element.style.display = "none";
      });
  }
}

/* =========================================
   INICIAR SITE
========================================= */

async function initializeSite() {
  await loadPublicSettings();

  await loadFeaturedVehicles();
}

initializeSite();
