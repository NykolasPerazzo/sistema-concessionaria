const container = document.getElementById("vehicleDetails");

const params = new URLSearchParams(window.location.search);

const vehicleId = params.get("id");

/* =========================================
   CARREGAR VEÍCULO
========================================= */

async function loadVehicle() {
  if (!vehicleId) {
    showError("Veículo não informado.");

    return;
  }

  try {
    const [vehicleResponse, galleryResponse] = await Promise.all([
      fetch(`${API_URL}/vehicles/${vehicleId}`),

      fetch(`${API_URL}/vehicle-images/${vehicleId}`),
    ]);

    if (!vehicleResponse.ok) {
      if (vehicleResponse.status === 404) {
        throw new Error("Veículo não encontrado.");
      }

      throw new Error("Erro ao buscar veículo.");
    }

    const vehicleData = await vehicleResponse.json();

    let galleryImages = [];

    if (galleryResponse.ok) {
      const galleryData = await galleryResponse.json();

      galleryImages = galleryData.images || [];
    }

    renderVehicle(vehicleData.vehicle, galleryImages);
  } catch (error) {
    console.error("Erro ao carregar veículo:", error);

    showError(error.message);
  }
}

/* =========================================
   FORMATAR PREÇO
========================================= */

function formatPrice(price) {
  return Number(price || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/* =========================================
   RENDERIZAR VEÍCULO
========================================= */

function renderVehicle(vehicle, galleryImages) {
  document.title = `${vehicle.brand || ""} ${vehicle.model || ""} | Car Dealer IA`;

  const price = formatPrice(vehicle.price);

  const mileage = vehicle.mileage
    ? `${Number(vehicle.mileage).toLocaleString("pt-BR")} km`
    : "Não informado";

  /* =====================================
     IMAGENS
  ====================================== */

  const allImages = [];

  /*
    Imagem principal
  */

  if (vehicle.image_url) {
    allImages.push({
      image_url: vehicle.image_url,
      is_cover: true,
    });
  }

  /*
    Galeria
  */

  if (Array.isArray(galleryImages)) {
    galleryImages.forEach((image) => {
      if (image && image.image_url) {
        /*
            Evita repetir a imagem principal.
          */

        const alreadyExists = allImages.some(
          (existingImage) => existingImage.image_url === image.image_url,
        );

        if (!alreadyExists) {
          allImages.push(image);
        }
      }
    });
  }

  const hasImages = allImages.length > 0;

  const mainImage = hasImages ? allImages[0].image_url : null;

  /* =====================================
     HTML
  ====================================== */

  container.innerHTML = `

    <section class="vehicle-detail">

      <!-- GALERIA -->

      <div class="vehicle-gallery">

        <div class="vehicle-detail-image">

          ${
            mainImage
              ? `
                <img
                  id="mainVehicleImage"
                  src="${mainImage}"
                  alt="${vehicle.brand || ""} ${vehicle.model || ""}"
                >
              `
              : `
                <div class="vehicle-no-image vehicle-detail-no-image">

                  <span>
                    🚗
                  </span>

                  <p>
                    Veículo sem imagem
                  </p>

                </div>
              `
          }

        </div>


        ${
          allImages.length > 1
            ? `
              <div
                id="vehicleThumbnails"
                class="vehicle-thumbnails"
              >

                ${renderThumbnails(allImages)}

              </div>
            `
            : ""
        }

      </div>


      <!-- INFORMAÇÕES -->

      <div class="vehicle-detail-content">

        <span class="section-label">
          ${vehicle.year || "Ano não informado"}
        </span>


        <h1>
          ${vehicle.brand || ""}
          ${vehicle.model || ""}
        </h1>


        <div class="vehicle-detail-price">
          ${price}
        </div>


        <!-- ESPECIFICAÇÕES -->

        <div class="vehicle-specs">

          <!-- QUILOMETRAGEM -->

            <div class="vehicle-spec-info">
              <i class="fa-solid fa-gauge-high vehicle-spec-icon"></i>
              <span>Quilometragem</span>

              <strong>
                ${mileage}
              </strong>
            </div>



          <!-- COMBUSTÍVEL -->

            <div class="vehicle-spec-info">
              <i class="fa-solid fa-gas-pump vehicle-spec-icon"></i>
              <span>Combustível</span>

              <strong>
                ${vehicle.fuel || "Não informado"}
              </strong>
            </div>


          <!-- CÂMBIO -->

            <div class="vehicle-spec-info">
              <i class="fa-solid fa-gears vehicle-spec-icon"></i>
              <span>Câmbio</span>

              <strong>
                ${vehicle.transmission || "Não informado"}
              </strong>
            </div>



          <!-- CARROCERIA -->

            <div class="vehicle-spec-info">
              <i class="fa-solid fa-car-side vehicle-spec-icon"></i>
              <span>Carroceria</span>

              <strong>
                ${vehicle.body_type || "Não informado"}
              </strong>
            </div>


          <!-- COR -->

            <div class="vehicle-spec-info">
              <i class="fa-solid fa-palette vehicle-spec-icon"></i>
              <span>Cor</span>

              <strong>
                ${vehicle.color || "Não informado"}
              </strong>
            </div>




          <!-- STATUS -->

            <div class="vehicle-spec-info">
              <i class="fa-solid fa-circle-check vehicle-spec-icon"></i>
              <span>Status</span>

              <strong>
                ${formatStatus(vehicle.status)}
              </strong>
            </div>

 

        </div>


        <!-- DESCRIÇÃO -->

        <div class="vehicle-description-block">

          <h2>
            Sobre este veículo
          </h2>


          <p class="vehicle-description">

            ${vehicle.description || "Descrição não informada."}

          </p>

        </div>


        <!-- BOTÕES -->

        <div class="vehicle-detail-actions">

          <button
            type="button"
            class="btn btn-primary"
            id="interestButton"
          >
            Tenho interesse
          </button>


          <button
            type="button"
            class="btn btn-secondary"
            id="financeButton"
          >
            Simular financiamento
          </button>

        </div>

      </div>

    </section>


    <!-- IA -->

    <section class="vehicle-ai">

      <span class="section-label">
        CAR DEALER IA
      </span>


      <h2>
        Quer saber mais sobre este veículo?
      </h2>


      <p>
        Pergunte para nossa IA sobre características,
        consumo, comparação e adequação ao seu perfil.
      </p>


      <button
        type="button"
        class="btn btn-primary"
        id="aiButton"
      >
        🤖 Perguntar à IA
      </button>

    </section>

  `;

  setupGalleryEvents();

  setupVehicleActions(vehicle);
}

/* =========================================
   MINIATURAS
========================================= */

function renderThumbnails(images) {
  return images
    .map((image, index) => {
      return `

          <button
            type="button"
            class="vehicle-thumbnail ${index === 0 ? "active" : ""}"
            data-image="${image.image_url}"
          >

            <img
              src="${image.image_url}"
              alt="Foto ${index + 1}"
              loading="lazy"
            >

          </button>

        `;
    })
    .join("");
}

/* =========================================
   EVENTOS DA GALERIA
========================================= */

function setupGalleryEvents() {
  const mainImage = document.getElementById("mainVehicleImage");

  if (!mainImage) {
    return;
  }

  const thumbnails = document.querySelectorAll(".vehicle-thumbnail");

  thumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener("click", () => {
      const imageUrl = thumbnail.dataset.image;

      if (!imageUrl) {
        return;
      }

      mainImage.src = imageUrl;

      thumbnails.forEach((item) => {
        item.classList.remove("active");
      });

      thumbnail.classList.add("active");
    });
  });
}

/* =========================================
   BOTÕES
========================================= */

function setupVehicleActions(vehicle) {
  const interestButton = document.getElementById("interestButton");

  const financeButton = document.getElementById("financeButton");

  const aiButton = document.getElementById("aiButton");

  if (vehicle.status === "sold") {
    if (interestButton) { interestButton.disabled = true; interestButton.textContent = "Veículo vendido"; }
    if (financeButton) financeButton.hidden = true;
    return;
  }

  if (interestButton) {
    interestButton.addEventListener("click", () => {
      alert(`Você demonstrou interesse no ${vehicle.brand} ${vehicle.model}.`);
    });
  }

  if (financeButton) {
    financeButton.addEventListener("click", () => {
      alert("A simulação de financiamento estará disponível em breve.");
    });
  }

  if (aiButton) {
    aiButton.addEventListener("click", () => {
      alert("O assistente de IA será conectado em uma próxima etapa.");
    });
  }
}

/* =========================================
   STATUS
========================================= */

function formatStatus(status) {
  const statuses = {
    available: "Disponível",

    reserved: "Reservado",

    sold: "Vendido",
  };

  return statuses[status] || status || "Não informado";
}

/* =========================================
   ERRO
========================================= */

function showError(message) {
  container.innerHTML = `

    <div class="error-message">

      <h2>
        Ops!
      </h2>


      <p>
        ${message}
      </p>


      <a
        href="./vehicles.html"
        class="btn btn-primary"
      >
        Voltar para veículos
      </a>

    </div>

  `;
}

/* =========================================
   INICIAR
========================================= */

loadVehicle();
