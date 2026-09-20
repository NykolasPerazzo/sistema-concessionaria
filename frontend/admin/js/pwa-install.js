/*
 * Registro do service worker + fluxo de instalação da PWA.
 * Não guarda nada além de uma preferência de exibição (localStorage),
 * nunca dados pessoais ou de sessão.
 */
(function () {
  "use strict";

  const STANDALONE_QUERY = "(display-mode: standalone)";
  const IOS_HINT_DISMISSED_KEY = "carDealerPwaIosHintDismissed";

  function isStandalone() {
    return (
      (window.matchMedia && window.matchMedia(STANDALONE_QUERY).matches) ||
      window.navigator.standalone === true
    );
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");
  }

  let deferredPrompt = null;

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/service-worker.js")
        .catch((error) => {
          console.error("Falha ao registrar o service worker.", error);
        });
    });
  }

  function setupInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredPrompt = event;
      window.dispatchEvent(new CustomEvent("pwa:install-available"));
    });

    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      window.dispatchEvent(new CustomEvent("pwa:installed"));
    });
  }

  function canPromptInstall() {
    return Boolean(deferredPrompt);
  }

  async function promptInstall() {
    if (!deferredPrompt) {
      return { outcome: "unavailable" };
    }

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    window.dispatchEvent(
      new CustomEvent("pwa:install-outcome", { detail: choice }),
    );
    return choice;
  }

  function readIosHintDismissed() {
    try {
      return localStorage.getItem(IOS_HINT_DISMISSED_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function dismissIosHint() {
    try {
      localStorage.setItem(IOS_HINT_DISMISSED_KEY, "1");
    } catch (error) {
      // Armazenamento indisponível (ex.: modo privado). Sem problema, apenas não persiste.
    }
  }

  function buildIosHintBanner() {
    const banner = document.createElement("div");
    banner.className = "pwa-ios-hint";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");

    const icon = document.createElement("span");
    icon.className = "pwa-ios-hint-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "⤴";

    const text = document.createElement("p");
    text.textContent =
      'Para instalar o Car Dealer IA, toque em Compartilhar e depois em "Adicionar à Tela de Início".';

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "pwa-ios-hint-close";
    closeButton.setAttribute("aria-label", "Fechar aviso de instalação");
    closeButton.textContent = "×";

    closeButton.addEventListener("click", () => {
      dismissIosHint();
      banner.remove();
    });

    banner.appendChild(icon);
    banner.appendChild(text);
    banner.appendChild(closeButton);

    return banner;
  }

  function showIosHint({ force } = {}) {
    if (!isIOS() || isStandalone()) return false;
    if (!force && readIosHintDismissed()) return false;
    if (document.querySelector(".pwa-ios-hint")) return true;

    document.body.appendChild(buildIosHintBanner());
    return true;
  }

  registerServiceWorker();
  setupInstallPrompt();

  document.addEventListener("DOMContentLoaded", () => {
    showIosHint();
  });

  window.CarDealerPWA = {
    isStandalone,
    isIOS,
    canPromptInstall,
    promptInstall,
    showIosHint,
  };
})();
