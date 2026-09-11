(function () {
  "use strict";

  const FINANCE_RATE = 0.0149;

  const money = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

  const byId = (id) => document.getElementById(id);

  /* ==========================================
     ESTOQUE REAL (COMPARTILHADO ENTRE
     O SIMULADOR DE FINANCIAMENTO E O
     ASSISTENTE DE MATCH)
  ========================================== */

  let vehiclesPromise = null;

  function fetchVehicles() {
    if (vehiclesPromise) {
      return vehiclesPromise;
    }

    vehiclesPromise = fetch(`${API_URL}/vehicles`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Erro ao buscar veículos.");
        }

        return response.json();
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : data.vehicles || data.data || [];

        return list.filter((vehicle) => vehicle.status !== "sold");
      })
      .catch((error) => {
        vehiclesPromise = null;

        throw error;
      });

    return vehiclesPromise;
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  /* ==========================================
     NAVEGAÇÃO SUAVE ENTRE AS SEÇÕES
  ========================================== */

  function setupNavigation() {
    const internalLinks = document.querySelectorAll(
      'a[href^="#"]:not([href="#"])',
    );

    internalLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        const targetId = link.getAttribute("href");
        const target = document.querySelector(targetId);

        if (!target) return;

        event.preventDefault();

        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

        history.replaceState(null, "", targetId);
      });
    });
  }

  /* ==========================================
     ANIMAÇÃO DAS SEÇÕES AO ROLAR
  ========================================== */

  function setupReveal() {
    const items = document.querySelectorAll(".cd-reveal");

    if (!items.length) return;

    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => {
        item.classList.add("is-visible");
      });

      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -50px",
      },
    );

    items.forEach((item) => {
      observer.observe(item);
    });
  }

  /* ==========================================
     IMAGEM ALTERNATIVA DA SEÇÃO SOBRE
  ========================================== */

  function setupAboutImageFallback() {
    const visual = document.querySelector(".cd-about__visual");
    const image = visual?.querySelector("img");

    if (!visual || !image) return;

    const markMissing = () => {
      visual.classList.add("is-image-missing");
    };

    image.addEventListener("error", markMissing, {
      once: true,
    });

    if (image.complete && image.naturalWidth === 0) {
      markMissing();
    }
  }

  /* ==========================================
     CÁLCULO DO FINANCIAMENTO
  ========================================== */

  function calculateInstallment(balance, months) {
    if (balance <= 0 || months <= 0) {
      return 0;
    }

    const factor = Math.pow(1 + FINANCE_RATE, months);

    return balance * ((FINANCE_RATE * factor) / (factor - 1));
  }

  function setupFinance() {
    const form = byId("finance-form");
    const priceField = byId("vehicle-price");
    const entryField = byId("entry");
    const monthsField = byId("months");

    const entryValue = byId("entry-value");
    const total = byId("finance-total");
    const payment = byId("payment-value");

    if (
      !form ||
      !priceField ||
      !entryField ||
      !monthsField ||
      !entryValue ||
      !total ||
      !payment
    ) {
      return;
    }

    const update = () => {
      const price = Number(priceField.value);
      const entryPercent = Number(entryField.value);
      const months = Number(monthsField.value);

      const entry = price * (entryPercent / 100);
      const balance = Math.max(price - entry, 0);

      const installment = calculateInstallment(balance, months);

      const progress =
        ((entryPercent - Number(entryField.min)) /
          (Number(entryField.max) - Number(entryField.min))) *
        100;

      entryField.style.setProperty("--range-progress", `${progress}%`);

      entryValue.textContent = `${money.format(entry)} (${entryPercent}%)`;

      total.textContent = `${months} meses · saldo ${money.format(balance)}`;

      payment.textContent = money.format(installment);
    };

    [priceField, entryField, monthsField].forEach((field) => {
      field.addEventListener("input", update);
      field.addEventListener("change", update);
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
    });

    update();
  }

  /* ==========================================
     PREENCHE O SIMULADOR COM O ESTOQUE REAL
  ========================================== */

  function populateFinanceVehicles() {
    const priceField = byId("vehicle-price");

    if (!priceField) {
      return;
    }

    fetchVehicles()
      .then((vehicles) => {
        const priced = vehicles
          .filter(
            (vehicle) =>
              vehicle.status === "available" && Number(vehicle.price) > 0,
          )
          .sort((a, b) => Number(a.price) - Number(b.price));

        if (!priced.length) {
          return;
        }

        priceField.innerHTML = priced
          .map((vehicle) => {
            const label = `${vehicle.brand || ""} ${vehicle.model || ""} — ${money.format(Number(vehicle.price))}`;

            return `<option value="${Number(vehicle.price)}">${label}</option>`;
          })
          .join("");

        priceField.dispatchEvent(new Event("change"));
      })
      .catch((error) => {
        console.error(
          "Não foi possível carregar o estoque para a simulação:",
          error,
        );
      });
  }

  /* ==========================================
     ASSISTENTE DE MATCH (PERFIL + ORÇAMENTO)
  ========================================== */

  function vehicleMatchesProfile(vehicle, profile) {
    const bodyType = normalizeText(vehicle.body_type);
    const target = normalizeText(profile);

    if (!bodyType || !target) {
      return false;
    }

    return bodyType.includes(target) || target.includes(bodyType);
  }

  function renderMatchResult(container, vehicles) {
    if (!vehicles.length) {
      container.innerHTML =
        "<p>Ainda não temos um veículo desse perfil dentro desse orçamento. Fale com a gente pelo WhatsApp para saber sobre as próximas chegadas.</p>";

      return;
    }

    const items = vehicles
      .slice(0, 3)
      .map((vehicle) => {
        const label = `${vehicle.brand || ""} ${vehicle.model || ""}`.trim();

        return `<li><a href="./vehicle.html?id=${vehicle.id}">${label} — ${money.format(Number(vehicle.price))}</a></li>`;
      })
      .join("");

    container.innerHTML = `<p>Encontramos ${vehicles.length === 1 ? "esta opção" : "estas opções"} no estoque para o seu perfil:</p><ul class="match-list">${items}</ul>`;
  }

  function setupMatchForm() {
    const form = byId("match-form");
    const result = byId("match-result");
    const budgetField = byId("budget");

    if (!form || !result || !budgetField) {
      return;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const profile =
        form.querySelector('input[name="profile"]:checked')?.value || "";

      const budget = Number(budgetField.value);

      const submitButton = form.querySelector('button[type="submit"]');

      if (submitButton) {
        submitButton.disabled = true;
      }

      result.innerHTML = "<p>Buscando no estoque...</p>";

      fetchVehicles()
        .then((vehicles) => {
          const matches = vehicles
            .filter((vehicle) => vehicle.status === "available")
            .filter((vehicle) => !budget || Number(vehicle.price) <= budget)
            .filter((vehicle) => vehicleMatchesProfile(vehicle, profile))
            .sort((a, b) => Number(b.price) - Number(a.price));

          renderMatchResult(result, matches);
        })
        .catch((error) => {
          console.error("Não foi possível buscar o estoque:", error);

          result.innerHTML =
            "<p>Não foi possível consultar o estoque agora. Tente novamente em instantes.</p>";
        })
        .finally(() => {
          if (submitButton) {
            submitButton.disabled = false;
          }
        });
    });
  }

  /* ==========================================
     LOCALIZA O WHATSAPP CONFIGURADO
  ========================================== */

  function findWhatsAppNumber() {
    const configured =
      window.CAR_DEALER_SETTINGS?.whatsapp ||
      window.PUBLIC_SETTINGS?.whatsapp ||
      document.documentElement.dataset.whatsapp ||
      "";

    if (configured) {
      return String(configured).replace(/\D/g, "");
    }

    const whatsappLinks = [
      ...document.querySelectorAll("a[data-whatsapp], a[href*='wa.me']"),
    ];

    const validLink = whatsappLinks
      .map((item) => item.href)
      .find((href) => /wa\.me\/\d+/.test(href));

    return validLink?.match(/wa\.me\/(\d+)/)?.[1] || "";
  }

  /* ==========================================
     MONTA MENSAGEM DO FINANCIAMENTO
  ========================================== */

  function buildFinanceMessage() {
    const vehicle =
      byId("vehicle-price")?.selectedOptions?.[0]?.textContent?.trim() ||
      "Veículo não informado";

    const entry =
      byId("entry-value")?.textContent?.trim() || "Entrada não informada";

    const months = byId("months")?.value || "Prazo não informado";

    const payment =
      byId("payment-value")?.textContent?.trim() || "Parcela não informada";

    return `Olá! Fiz uma simulação no site da Car Dealer IA.

Veículo: ${vehicle}
Entrada: ${entry}
Prazo: ${months} meses
Parcela estimada: ${payment}

Gostaria de conhecer as condições reais.`;
  }

  /* ==========================================
     MODAL DE CONTATO
  ========================================== */

  function setupContactDialog() {
    const dialog = byId("detail");
    const title = byId("detail-title");
    const description = byId("detail-description");
    const messageField = byId("detail-message");
    const status = byId("detail-status");
    const submit = byId("detail-submit");

    if (
      !dialog ||
      !title ||
      !description ||
      !messageField ||
      !status ||
      !submit
    ) {
      return;
    }

    function openDialog({ heading, helper, message }) {
      title.textContent = heading;
      description.textContent = helper;
      messageField.value = message;
      status.textContent = "";

      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }

      window.setTimeout(() => {
        messageField.focus();
      }, 80);
    }

    const financeButton = byId("finance-contact");

    financeButton?.addEventListener("click", () => {
      openDialog({
        heading: "Sua simulação está pronta.",

        helper: "Confira a mensagem e continue com um consultor pelo WhatsApp.",

        message: buildFinanceMessage(),
      });
    });

    const visitButton = byId("visit");

    visitButton?.addEventListener("click", () => {
      openDialog({
        heading: "Vamos agendar sua visita?",

        helper: "Envie sua preferência de dia e horário para nossa equipe.",

        message:
          "Olá! Conheci a Car Dealer IA pelo site e gostaria de agendar uma visita à loja. Qual é o melhor horário?",
      });
    });

    const closeButton = dialog.querySelector(".cd-dialog__close");

    closeButton?.addEventListener("click", () => {
      dialog.close();
    });

    dialog.addEventListener("click", (event) => {
      const box = dialog.getBoundingClientRect();

      const clickedOutside =
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom;

      if (clickedOutside) {
        dialog.close();
      }
    });

    submit.addEventListener("click", async () => {
      const message = messageField.value.trim();

      if (!message) {
        status.textContent = "Escreva uma mensagem para continuar.";

        messageField.focus();
        return;
      }

      const number = findWhatsAppNumber();

      if (number) {
        const whatsappURL = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

        window.open(whatsappURL, "_blank", "noopener,noreferrer");

        return;
      }

      try {
        await navigator.clipboard.writeText(message);

        status.textContent =
          "Mensagem copiada. Cadastre o WhatsApp da loja no config.js para abrir a conversa automaticamente.";
      } catch (error) {
        console.error("Não foi possível copiar a mensagem:", error);

        status.textContent =
          "Cadastre o WhatsApp da loja no config.js para ativar este botão.";
      }
    });
  }

  /* ==========================================
     INICIALIZAÇÃO
  ========================================== */

  function init() {
    setupNavigation();
    setupReveal();
    setupAboutImageFallback();
    setupFinance();
    populateFinanceVehicles();
    setupMatchForm();
    setupContactDialog();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true,
    });
  } else {
    init();
  }
})();
