/*
 * Shell de navegação mobile do painel admin (< 768px).
 *
 * Gera dinamicamente cabeçalho compacto, menu inferior, folha de
 * ações rápidas e folha "Mais" a partir do <nav class="sidebar"> que já
 * existe em cada página — evita duplicar uma estrutura de navegação
 * gigante em todos os HTMLs. Acima de 768px este script não altera a
 * navegação desktop (a sidebar continua exatamente como está).
 *
 * Também cuida de:
 * - marcar a página ativa via window.location.pathname;
 * - transformar tabelas grandes em cards no celular;
 * - abrir a ação certa quando a PWA é aberta por um atalho
 *   (?quickAction=... ou ?focus=crlv);
 * - botão flutuante de ação primária em páginas operacionais.
 */
(function () {
  "use strict";

  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return; // login.html e o site público não usam este shell

  document.body.classList.add("has-mobile-shell");

  function pageKeyFromPath() {
    const path = window.location.pathname;
    const file = path.substring(path.lastIndexOf("/") + 1);
    return (file || "index.html").replace(/\.html$/, "") || "index";
  }

  const pageKey = pageKeyFromPath();

  const PAGE_TITLES = {
    index: "Central de comando",
    vehicles: "Veículos",
    "vehicle-form": "Veículo",
    leads: "Leads",
    customers: "Clientes",
    proposals: "Propostas",
    sales: "Vendas",
    documentation: "Documentação",
    despachante: "Despachante",
    "despachante-detail": "Processo",
    ai: "IA",
    settings: "Configurações",
  };

  const BACK_MAP = {
    "vehicle-form": "./vehicles.html",
    "despachante-detail": "./despachante.html",
  };

  const BOTTOM_NAV_HREFS = ["index.html", "vehicles.html", "leads.html"];

  /* =========================================
     CABEÇALHO MOBILE
  ========================================= */

  function buildHeader() {
    const header = document.createElement("header");
    header.className = "mobile-app-header";

    const start = document.createElement("div");
    start.className = "mobile-app-header-start";

    const backHref = BACK_MAP[pageKey];
    if (backHref) {
      const back = document.createElement("a");
      back.className = "mobile-app-header-back";
      back.href = backHref;
      back.setAttribute("aria-label", "Voltar");
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-arrow-left";
      icon.setAttribute("aria-hidden", "true");
      back.appendChild(icon);
      start.appendChild(back);
    } else {
      const mark = document.createElement("span");
      mark.className = "mobile-app-header-mark";
      mark.setAttribute("aria-hidden", "true");
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-bolt";
      mark.appendChild(icon);
      start.appendChild(mark);
    }

    const title = document.createElement("h1");
    title.className = "mobile-app-header-title";
    title.id = "mobileAppHeaderTitle";
    title.textContent = PAGE_TITLES[pageKey] || document.title.split("|")[0].trim();
    start.appendChild(title);

    const end = document.createElement("div");
    end.className = "mobile-app-header-end";

    if (pageKey !== "leads") {
      const bell = document.createElement("a");
      bell.className = "mobile-app-header-bell";
      bell.href = "./leads.html";
      bell.setAttribute("aria-label", "Leads novos");
      const bellIcon = document.createElement("i");
      bellIcon.className = "fa-solid fa-bell";
      bellIcon.setAttribute("aria-hidden", "true");
      const bellBadge = document.createElement("span");
      bellBadge.className = "mobile-app-header-badge";
      bellBadge.id = "mobileHeaderLeadsBadge";
      bellBadge.hidden = true;
      bell.appendChild(bellIcon);
      bell.appendChild(bellBadge);
      end.appendChild(bell);

      mirrorLeadsBadge(bellBadge);
    }

    header.appendChild(start);
    header.appendChild(end);
    document.body.insertBefore(header, document.body.firstChild);

    if (pageKey === "vehicle-form") {
      const pageTitleEl = document.getElementById("pageTitle");
      if (pageTitleEl && "MutationObserver" in window) {
        const sync = () => {
          title.textContent = pageTitleEl.textContent.trim() || "Veículo";
        };
        sync();
        new MutationObserver(sync).observe(pageTitleEl, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      }
    }
  }

  function mirrorLeadsBadge(target) {
    const source = document.getElementById("leadsNavBadge");
    if (!source || !("MutationObserver" in window)) return;

    const sync = () => {
      target.textContent = source.textContent;
      target.hidden = source.hidden;
    };
    sync();
    new MutationObserver(sync).observe(source, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"],
    });
  }

  /* =========================================
     FOLHAS (BOTTOM SHEETS) — base compartilhada
  ========================================= */

  let openSheetState = null;

  function getFocusable(container) {
    return Array.from(
      container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null);
  }

  function lockBodyScroll() {
    const scrollY = window.scrollY;
    document.body.dataset.scrollLockY = String(scrollY);
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.classList.add("mobile-scroll-locked");
  }

  function unlockBodyScroll() {
    const scrollY = parseInt(document.body.dataset.scrollLockY || "0", 10);
    document.body.classList.remove("mobile-scroll-locked");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    delete document.body.dataset.scrollLockY;
    window.scrollTo(0, scrollY);
  }

  function openSheet(sheetEl, triggerEl) {
    if (openSheetState) closeSheet(openSheetState.sheetEl, { restoreFocus: false });

    sheetEl.hidden = false;
    requestAnimationFrame(() => sheetEl.classList.add("is-open"));
    lockBodyScroll();
    if (triggerEl) triggerEl.setAttribute("aria-expanded", "true");

    const focusable = getFocusable(sheetEl);
    (focusable[0] || sheetEl).focus({ preventScroll: true });

    openSheetState = { sheetEl, triggerEl };
  }

  function closeSheet(sheetEl, { restoreFocus = true } = {}) {
    if (!sheetEl || sheetEl.hidden) return;

    sheetEl.classList.remove("is-open");
    unlockBodyScroll();

    const trigger = openSheetState && openSheetState.sheetEl === sheetEl
      ? openSheetState.triggerEl
      : null;

    if (trigger) trigger.setAttribute("aria-expanded", "false");

    window.setTimeout(() => {
      sheetEl.hidden = true;
    }, 220);

    if (openSheetState && openSheetState.sheetEl === sheetEl) {
      openSheetState = null;
    }

    if (restoreFocus && trigger) trigger.focus();
  }

  function buildSheet({ id, labelledBy }) {
    const backdrop = document.createElement("div");
    backdrop.className = "mobile-sheet-backdrop";
    backdrop.hidden = true;

    const sheet = document.createElement("div");
    sheet.className = "mobile-sheet";
    sheet.id = id;
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    if (labelledBy) sheet.setAttribute("aria-labelledby", labelledBy);
    sheet.tabIndex = -1;
    sheet.hidden = true;

    backdrop.addEventListener("click", () => closeSheet(sheet));

    sheet.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSheet(sheet);
        return;
      }
      if (event.key === "Tab") {
        const focusable = getFocusable(sheet);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    // A folha some junto com o backdrop: mantém ambos sincronizados.
    const originalHiddenSetter = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "hidden",
    );
    Object.defineProperty(sheet, "hidden", {
      get() {
        return originalHiddenSetter.get.call(this);
      },
      set(value) {
        originalHiddenSetter.set.call(this, value);
        backdrop.hidden = value;
      },
    });

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);

    return sheet;
  }

  function addSheetHeader(sheet, titleText, id) {
    const header = document.createElement("div");
    header.className = "mobile-sheet-header";

    const title = document.createElement("h2");
    title.id = id;
    title.textContent = titleText;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "mobile-sheet-close";
    close.setAttribute("aria-label", "Fechar");
    close.textContent = "×";
    close.addEventListener("click", () => closeSheet(sheet));

    header.appendChild(title);
    header.appendChild(close);
    sheet.appendChild(header);

    const handle = document.createElement("div");
    handle.className = "mobile-sheet-handle";
    handle.setAttribute("aria-hidden", "true");
    sheet.insertBefore(handle, header);
  }

  function addSheetItem(sheet, { icon, label, href, target, onActivate, danger }) {
    const list = sheet.querySelector(".mobile-sheet-list") || (() => {
      const el = document.createElement("div");
      el.className = "mobile-sheet-list";
      sheet.appendChild(el);
      return el;
    })();

    const item = document.createElement(href ? "a" : "button");
    item.className = "mobile-sheet-item" + (danger ? " is-danger" : "");
    if (href) {
      item.href = href;
      if (target) {
        item.target = target;
        item.rel = "noopener";
      }
    } else {
      item.type = "button";
    }

    const iconWrap = document.createElement("span");
    iconWrap.className = "mobile-sheet-item-icon";
    iconWrap.setAttribute("aria-hidden", "true");
    if (icon) {
      const i = document.createElement("i");
      i.className = icon;
      iconWrap.appendChild(i);
    }

    const text = document.createElement("span");
    text.className = "mobile-sheet-item-label";
    text.textContent = label;

    item.appendChild(iconWrap);
    item.appendChild(text);

    if (onActivate) {
      item.addEventListener("click", (event) => {
        if (!href) event.preventDefault();
        onActivate(event);
      });
    }

    list.appendChild(item);
    return item;
  }

  /* =========================================
     MENU INFERIOR
  ========================================= */

  function buildBottomNav() {
    const nav = document.createElement("nav");
    nav.className = "mobile-bottom-nav";
    nav.setAttribute("aria-label", "Navegação principal");

    const items = [
      { key: "index", href: "./index.html", icon: "fa-solid fa-house", label: "Início" },
      { key: "vehicles", href: "./vehicles.html", icon: "fa-solid fa-car-side", label: "Veículos" },
      { key: "__action__", icon: "fa-solid fa-plus", label: "Ações rápidas" },
      { key: "leads", href: "./leads.html", icon: "fa-solid fa-users", label: "Leads" },
      { key: "__more__", icon: "fa-solid fa-ellipsis", label: "Mais" },
    ];

    items.forEach((item) => {
      if (item.key === "__action__") {
        const actionButton = document.createElement("button");
        actionButton.type = "button";
        actionButton.className = "mobile-bottom-nav-action";
        actionButton.setAttribute("aria-haspopup", "dialog");
        actionButton.setAttribute("aria-expanded", "false");
        actionButton.setAttribute("aria-label", item.label);
        const icon = document.createElement("i");
        icon.className = item.icon;
        icon.setAttribute("aria-hidden", "true");
        actionButton.appendChild(icon);
        actionButton.addEventListener("click", () => openSheet(quickActionSheet, actionButton));
        nav.appendChild(actionButton);
        return;
      }

      if (item.key === "__more__") {
        const moreButton = document.createElement("button");
        moreButton.type = "button";
        moreButton.className = "mobile-bottom-nav-item";
        moreButton.setAttribute("aria-haspopup", "dialog");
        moreButton.setAttribute("aria-expanded", "false");
        const icon = document.createElement("i");
        icon.className = item.icon;
        icon.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = item.label;
        moreButton.appendChild(icon);
        moreButton.appendChild(label);
        moreButton.addEventListener("click", () => openSheet(moreSheet, moreButton));
        nav.appendChild(moreButton);
        return;
      }

      const link = document.createElement("a");
      link.className = "mobile-bottom-nav-item";
      link.href = item.href;
      const icon = document.createElement("i");
      icon.className = item.icon;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = item.label;
      link.appendChild(icon);
      link.appendChild(label);

      if (item.key === pageKey || (item.key === "index" && pageKey === "index")) {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "page");
      }

      if (item.key === "leads") {
        const badge = document.createElement("span");
        badge.className = "mobile-bottom-nav-badge";
        badge.id = "mobileBottomNavLeadsBadge";
        badge.hidden = true;
        link.appendChild(badge);
        mirrorLeadsBadge(badge);
      }

      nav.appendChild(link);
    });

    document.body.appendChild(nav);
  }

  /* =========================================
     AÇÃO — clicar em botão "novo X" respeitando estado disabled
  ========================================= */

  function clickWhenEnabled(buttonId, { timeout = 8000 } = {}) {
    const start = Date.now();

    return new Promise((resolve) => {
      function attempt() {
        const button = document.getElementById(buttonId);
        if (button && !button.disabled) {
          button.click();
          resolve(true);
          return;
        }
        if (Date.now() - start > timeout) {
          resolve(false);
          return;
        }
        window.setTimeout(attempt, 150);
      }
      attempt();
    });
  }

  /* =========================================
     FOLHA DE AÇÕES RÁPIDAS
  ========================================= */

  const quickActionSheet = buildSheet({
    id: "quickActionSheet",
    labelledBy: "quickActionSheetTitle",
  });
  addSheetHeader(quickActionSheet, "Ações rápidas", "quickActionSheetTitle");
  addSheetItem(quickActionSheet, {
    icon: "fa-solid fa-car-side",
    label: "Cadastrar veículo",
    href: "./vehicle-form.html",
  });
  addSheetItem(quickActionSheet, {
    icon: "fa-solid fa-file-arrow-up",
    label: "Ler CRLV",
    href: "./vehicle-form.html?focus=crlv",
  });
  addSheetItem(quickActionSheet, {
    icon: "fa-solid fa-users",
    label: "Registrar lead",
    href: "./leads.html?quickAction=new-lead",
  });
  addSheetItem(quickActionSheet, {
    icon: "fa-regular fa-file-lines",
    label: "Criar proposta",
    href: "./proposals.html?quickAction=new-proposal",
  });
  addSheetItem(quickActionSheet, {
    icon: "fa-solid fa-chart-simple",
    label: "Registrar venda",
    href: "./sales.html?quickAction=new-sale",
  });

  /* =========================================
     FOLHA "MAIS" — construída a partir da sidebar existente
  ========================================= */

  const moreSheet = buildSheet({ id: "moreSheet", labelledBy: "moreSheetTitle" });
  addSheetHeader(moreSheet, "Mais opções", "moreSheetTitle");

  function populateMoreSheet() {
    const mainSection = sidebar.querySelector(".nav-section:not(.sidebar-footer)");
    const footerSection = sidebar.querySelector(".nav-section.sidebar-footer");

    if (mainSection) {
      Array.from(mainSection.querySelectorAll(":scope > a.nav-link")).forEach((link) => {
        const href = link.getAttribute("href") || "";
        const hrefFile = href.substring(href.lastIndexOf("/") + 1);
        if (BOTTOM_NAV_HREFS.includes(hrefFile)) return; // já está no menu inferior

        const iconEl = link.querySelector("i");
        const labelEl = link.querySelector("span:not(.nav-badge)");
        const item = addSheetItem(moreSheet, {
          icon: iconEl ? iconEl.className : "",
          label: labelEl ? labelEl.textContent.trim() : link.textContent.trim(),
          href,
        });

        const linkFile = hrefFile.replace(/\.html$/, "");
        if (linkFile === pageKey) {
          item.classList.add("is-active");
          item.setAttribute("aria-current", "page");
        }
      });
    }

    // Instalar aplicativo
    addSheetItem(moreSheet, {
      icon: "fa-solid fa-arrow-down-to-line",
      label: "Instalar aplicativo",
      onActivate: () => handleInstallRequest(),
    });

    if (footerSection) {
      const publicSiteLink = footerSection.querySelector('a.nav-link[href*="index.html"]');
      if (publicSiteLink) {
        addSheetItem(moreSheet, {
          icon: "fa-solid fa-arrow-up-right-from-square",
          label: publicSiteLink.querySelector("span")?.textContent.trim() || "Ver site público",
          href: publicSiteLink.getAttribute("href"),
          target: "_blank",
        });
      }

      const themeButton = footerSection.querySelector("#themeToggle");
      if (themeButton) {
        addSheetItem(moreSheet, {
          icon: "fa-regular fa-moon",
          label: "Alternar tema",
          onActivate: () => themeButton.click(),
        });
      }

      const logoutButton = footerSection.querySelector("#logoutButton");
      if (logoutButton) {
        addSheetItem(moreSheet, {
          icon: "fa-solid fa-arrow-right-from-bracket",
          label: "Sair",
          danger: true,
          onActivate: () => {
            closeSheet(moreSheet, { restoreFocus: false });
            logoutButton.click();
          },
        });
      }
    }
  }

  function handleInstallRequest() {
    const pwa = window.CarDealerPWA;
    if (!pwa) return;

    if (pwa.isIOS()) {
      closeSheet(moreSheet, { restoreFocus: false });
      pwa.showIosHint({ force: true });
      return;
    }

    if (pwa.canPromptInstall()) {
      closeSheet(moreSheet, { restoreFocus: false });
      pwa.promptInstall();
    }
  }

  /* =========================================
     BOTÃO FLUTUANTE POR PÁGINA
  ========================================= */

  const FAB_CONFIG = {
    vehicles: { label: "Novo veículo", icon: "fa-solid fa-plus", href: "./vehicle-form.html" },
    leads: { label: "Novo lead", icon: "fa-solid fa-plus", buttonId: "newLead" },
    customers: { label: "Novo cliente", icon: "fa-solid fa-plus", buttonId: "newCustomer" },
    proposals: { label: "Nova proposta", icon: "fa-solid fa-plus", buttonId: "newProposal" },
    sales: { label: "Registrar venda", icon: "fa-solid fa-plus", buttonId: "newSaleButton" },
  };

  function buildFab() {
    const config = FAB_CONFIG[pageKey];
    if (!config) return;

    const fab = document.createElement(config.href ? "a" : "button");
    fab.className = "mobile-fab";
    if (config.href) {
      fab.href = config.href;
    } else {
      fab.type = "button";
      fab.addEventListener("click", () => clickWhenEnabled(config.buttonId));
    }
    fab.setAttribute("aria-label", config.label);

    const icon = document.createElement("i");
    icon.className = config.icon;
    icon.setAttribute("aria-hidden", "true");
    fab.appendChild(icon);

    document.body.appendChild(fab);
  }

  /* =========================================
     AÇÕES RÁPIDAS NO TOPO DO DASHBOARD
  ========================================= */

  const DASHBOARD_QUICK_ACTIONS = [
    { icon: "fa-solid fa-car-side", label: "Novo veículo", href: "./vehicle-form.html" },
    { icon: "fa-solid fa-file-arrow-up", label: "Ler CRLV", href: "./vehicle-form.html?focus=crlv" },
    { icon: "fa-solid fa-users", label: "Novo lead", href: "./leads.html?quickAction=new-lead" },
    { icon: "fa-regular fa-file-lines", label: "Nova proposta", href: "./proposals.html?quickAction=new-proposal" },
    { icon: "fa-solid fa-chart-simple", label: "Registrar venda", href: "./sales.html?quickAction=new-sale" },
  ];

  function buildDashboardQuickActions() {
    if (pageKey !== "index") return;

    const shell = document.querySelector(".command-shell");
    const hero = document.querySelector(".command-hero");
    if (!shell) return;

    const wrap = document.createElement("section");
    wrap.className = "mobile-dashboard-quick-actions";
    wrap.setAttribute("aria-label", "Ações rápidas");

    DASHBOARD_QUICK_ACTIONS.forEach((action) => {
      const link = document.createElement("a");
      link.href = action.href;
      const icon = document.createElement("i");
      icon.className = action.icon;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = action.label;
      link.appendChild(icon);
      link.appendChild(label);
      wrap.appendChild(link);
    });

    if (hero && hero.parentNode) {
      hero.parentNode.insertBefore(wrap, hero.nextSibling);
    } else {
      shell.insertBefore(wrap, shell.firstChild);
    }
  }

  /* =========================================
     ATALHOS VINDOS DA PWA (?quickAction / ?focus)
  ========================================= */

  function handleIncomingShortcuts() {
    const params = new URLSearchParams(window.location.search);
    const quickAction = params.get("quickAction");
    const focus = params.get("focus");

    const QUICK_ACTION_BUTTONS = {
      "new-lead": "newLead",
      "new-proposal": "newProposal",
      "new-sale": "newSaleButton",
    };

    if (quickAction && QUICK_ACTION_BUTTONS[quickAction]) {
      clickWhenEnabled(QUICK_ACTION_BUTTONS[quickAction]);
    }

    if (focus === "crlv") {
      const section = document.getElementById("crlvImportSection");
      if (section) {
        window.setTimeout(() => {
          section.scrollIntoView({ behavior: "smooth", block: "start" });
          const dropzone = document.getElementById("crlvDropzone");
          if (dropzone) dropzone.focus({ preventScroll: true });
        }, 150);
      }
    }
  }

  /* =========================================
     TABELAS RESPONSIVAS (viram cards no celular)
  ========================================= */

  function applyTableLabels(table) {
    const headerCells = Array.from(table.querySelectorAll("thead th")).map((th) =>
      th.textContent.trim(),
    );
    if (!headerCells.length) return;

    table.querySelectorAll("tbody tr").forEach((row) => {
      const cells = Array.from(row.children);
      if (cells.length !== headerCells.length) return; // linhas de loading/erro com colspan
      cells.forEach((cell, index) => {
        if (headerCells[index]) cell.setAttribute("data-label", headerCells[index]);
      });
    });
  }

  function enhanceResponsiveTables() {
    document.querySelectorAll("main table").forEach((table) => {
      applyTableLabels(table);
      const tbody = table.querySelector("tbody");
      if (tbody && "MutationObserver" in window && !tbody.dataset.responsiveObserved) {
        tbody.dataset.responsiveObserved = "1";
        new MutationObserver(() => applyTableLabels(table)).observe(tbody, {
          childList: true,
        });
      }
    });
  }

  /* =========================================
     INIT
  ========================================= */

  buildHeader();
  buildBottomNav();
  populateMoreSheet();
  buildFab();
  buildDashboardQuickActions();
  enhanceResponsiveTables();
  handleIncomingShortcuts();
})();
