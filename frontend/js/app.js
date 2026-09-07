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

    const vehicleList = Array.isArray(data)
      ? data
      : data.vehicles || data.data || [];

    const vehicles = vehicleList.filter((vehicle) => vehicle.status !== "sold");

    /* HERO */

    heroVehicles = vehicles.slice(0, 6);
    const heroSection = document.querySelector(".hero-showcase");
    if (heroSection)
      heroSection.style.display = heroVehicles.length ? "" : "none";

    const stockCountElement = document.getElementById("aiFinderStockCount");
    if (stockCountElement) {
      stockCountElement.textContent = vehicles.length;
    }

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

      /*
        "Entra por baixo": posiciona o novo carro
        abaixo/reduzido sem transição, espera dois
        frames (garante que o navegador registrou
        essa posição) e só então remove a classe —
        assim ele anima subindo até o lugar.
      */

      if (animate) {
        hero.classList.add("entering");

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            hero.classList.remove("entering");
          });
        });
      }

      setTimeout(() => {
        heroChanging = false;
      }, 500);

      scheduleHeroAutoplay();
    },

    animate ? 320 : 0,
  );
}

/* =========================================
   TROCA AUTOMÁTICA
========================================= */

let heroAutoplayTimer = null;

function scheduleHeroAutoplay() {
  clearTimeout(heroAutoplayTimer);

  if (heroVehicles.length < 2) {
    return;
  }

  heroAutoplayTimer = setTimeout(() => {
    const nextIndex = (currentHeroVehicle + 1) % heroVehicles.length;

    updateHeroVehicle(nextIndex);
  }, 6000);
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
  /*
    Enquanto ainda há carro pra trocar naquela
    direção, intercepta o scroll do mouse (mesmo
    delta pequeno, pra não vazar um pouco de scroll
    da página a cada tentativa). Ao chegar no
    primeiro/último carro, libera o scroll normal
    da página nessa direção.
  */

  const WHEEL_THRESHOLD = 4;

  hero.addEventListener(
    "wheel",
    (event) => {
      if (heroChanging || !heroVehicles.length) {
        return;
      }

      const goingDown = event.deltaY > 0;

      const hasNext = currentHeroVehicle < heroVehicles.length - 1;
      const hasPrev = currentHeroVehicle > 0;

      if ((goingDown && !hasNext) || (!goingDown && !hasPrev)) {
        return;
      }

      event.preventDefault();

      if (Math.abs(event.deltaY) < WHEEL_THRESHOLD) {
        return;
      }

      if (goingDown) {
        updateHeroVehicle(currentHeroVehicle + 1);
      } else {
        updateHeroVehicle(currentHeroVehicle - 1);
      }
    },

    {
      passive: false,
    },
  );

  /*
    No celular não existe "wheel" — troca o
    veículo em destaque com um swipe horizontal.
  */

  let touchStartX = 0;
  let touchStartY = 0;

  hero.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];

      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    },
    {
      passive: true,
    },
  );

  hero.addEventListener(
    "touchend",
    (event) => {
      if (heroChanging || !heroVehicles.length) {
        return;
      }

      const touch = event.changedTouches[0];

      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      /* Ignora se o gesto foi mais vertical que horizontal */

      if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY)) {
        return;
      }

      if (deltaX < 0) {
        if (currentHeroVehicle < heroVehicles.length - 1) {
          updateHeroVehicle(currentHeroVehicle + 1);
        }
      } else if (currentHeroVehicle > 0) {
        updateHeroVehicle(currentHeroVehicle - 1);
      }
    },
    {
      passive: true,
    },
  );
}

/* =========================================
   ASSISTENTE DE IA (ENCONTRAR MEU CARRO)
========================================= */

const aiFinderForm = document.getElementById("aiFinderForm");
const aiFinderResult = document.getElementById("aiFinderResult");
const aiFinderLead = document.getElementById("aiFinderLead");
const aiFinderLeadForm = document.getElementById("aiFinderLeadForm");

let lastAiFinderQuery = null;

function showAiFinderResult(text, type) {
  if (!aiFinderResult) {
    return;
  }

  aiFinderResult.hidden = false;
  aiFinderResult.textContent = text;
  aiFinderResult.className = `ai-finder-result ${type}`;
}

function showAiFinderLead(message, type) {
  if (!aiFinderLead) {
    return;
  }

  aiFinderLead.hidden = false;
  aiFinderLead.className = `ai-finder-lead ${type || ""}`.trim();

  if (message) {
    const text = aiFinderLead.querySelector("p");

    if (text) {
      text.textContent = message;
    }
  }
}

if (aiFinderForm) {
  aiFinderForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const budget = document.getElementById("aiFinderBudget").value.trim();
    const usage = document.getElementById("aiFinderUsage").value.trim();
    const priority = document.getElementById("aiFinderPriority").value.trim();

    if (!budget && !usage) {
      showAiFinderResult(
        "Conte pelo menos o orçamento ou o uso principal do carro.",
        "error",
      );

      return;
    }

    const submitButton = aiFinderForm.querySelector(".ai-finder-submit");

    const originalText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = "Buscando...";

    showAiFinderResult("Consultando o estoque...", "loading");

    if (aiFinderLead) {
      aiFinderLead.hidden = true;
    }

    try {
      const response = await fetch(`${API_URL}/ai/recommend`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({ budget, usage, priority }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível buscar uma recomendação.",
        );
      }

      showAiFinderResult(data.answer, "success");

      lastAiFinderQuery = { budget, usage, priority, aiAnswer: data.answer };

      if (aiFinderLeadForm) {
        aiFinderLeadForm.hidden = false;
        aiFinderLeadForm.reset();

        const leadSubmitButton = aiFinderLeadForm.querySelector("button");

        if (leadSubmitButton) {
          leadSubmitButton.disabled = false;
          leadSubmitButton.textContent = "Quero ser avisado";
        }
      }

      showAiFinderLead(
        "Quer que a gente te chame no WhatsApp sobre esses carros?",
        "",
      );

      if (typeof fbq === "function") {
        fbq("trackCustom", "AiFinderUsed");
      }
    } catch (error) {
      console.error("Erro ao buscar recomendação:", error);

      showAiFinderResult(error.message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });
}

if (aiFinderLeadForm) {
  aiFinderLeadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const phoneInput = document.getElementById("aiFinderLeadPhone");
    const phone = phoneInput.value.trim();

    if (!phone) {
      return;
    }

    const submitButton = aiFinderLeadForm.querySelector("button");
    const originalText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = "Enviando...";

    try {
      const response = await fetch(`${API_URL}/ai/interested`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          phone,
          ...lastAiFinderQuery,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível enviar seu contato.");
      }

      aiFinderLeadForm.hidden = true;

      showAiFinderLead(
        "Contato recebido! Em breve alguém vai te chamar no WhatsApp.",
        "success",
      );

      if (typeof fbq === "function") {
        fbq("track", "Lead");
      }
    } catch (error) {
      console.error("Erro ao enviar contato:", error);

      submitButton.disabled = false;
      submitButton.textContent = originalText;

      showAiFinderLead(error.message, "error");
      aiFinderLeadForm.hidden = false;
    }
  });
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
    const heroAiButton = document.getElementById("heroAiButton");

    if (heroAiButton) {
      heroAiButton.style.display = "none";
    }

    const aiFinderSection = document.getElementById("aiFinderSection");

    if (aiFinderSection) {
      aiFinderSection.style.display = "none";
    }
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
