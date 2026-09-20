#!/usr/bin/env node

/*
 * Validação estática da PWA do Car Dealer IA.
 * Não sobe servidor nem abre navegador: apenas confere arquivos e
 * referências no disco. Roda com: npm run test:pwa
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");
const ADMIN = path.join(FRONTEND, "admin");

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readFile(relativePath) {
  const fullPath = path.join(FRONTEND, relativePath.replace(/^\//, ""));
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf8");
}

function exists(relativeToFrontend) {
  return fs.existsSync(path.join(FRONTEND, relativeToFrontend.replace(/^\//, "")));
}

// ---------- 1. manifest.webmanifest ----------

const manifestPath = path.join(FRONTEND, "manifest.webmanifest");
let manifest = null;

if (!fs.existsSync(manifestPath)) {
  fail("frontend/manifest.webmanifest não existe.");
} else {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail("frontend/manifest.webmanifest não é um JSON válido: " + error.message);
  }
}

if (manifest) {
  const requiredFields = [
    "name",
    "short_name",
    "description",
    "start_url",
    "scope",
    "display",
    "background_color",
    "theme_color",
    "orientation",
    "lang",
    "icons",
  ];
  requiredFields.forEach((field) => {
    if (!manifest[field]) fail(`manifest: campo obrigatório "${field}" ausente.`);
  });

  if (manifest.display !== "standalone") {
    fail('manifest: "display" deveria ser "standalone".');
  }

  if (manifest.start_url && !manifest.start_url.startsWith(manifest.scope || "")) {
    fail('manifest: "start_url" não está dentro do "scope".');
  }

  if (manifest.start_url && !exists(manifest.start_url)) {
    fail(`manifest: start_url "${manifest.start_url}" não corresponde a um arquivo real.`);
  }

  if (manifest.scope && !exists(manifest.scope)) {
    fail(`manifest: scope "${manifest.scope}" não corresponde a uma pasta real.`);
  }

  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const sizesFound = new Set();
  let hasMaskable = false;

  icons.forEach((icon) => {
    if (!icon.src || !exists(icon.src)) {
      fail(`manifest: ícone "${icon.src}" não existe em disco.`);
    }
    if (icon.sizes) sizesFound.add(icon.sizes);
    if (icon.purpose && icon.purpose.includes("maskable")) hasMaskable = true;
  });

  if (!sizesFound.has("192x192")) fail("manifest: falta ícone 192x192.");
  if (!sizesFound.has("512x512")) fail("manifest: falta ícone 512x512.");
  if (!hasMaskable) fail("manifest: falta um ícone com purpose maskable.");

  const shortcuts = Array.isArray(manifest.shortcuts) ? manifest.shortcuts : [];
  if (!shortcuts.length) {
    warn("manifest: nenhum shortcut definido.");
  }
  shortcuts.forEach((shortcut) => {
    const urlPath = (shortcut.url || "").split("?")[0].split("#")[0];
    if (!urlPath || !exists(urlPath)) {
      fail(`manifest: shortcut "${shortcut.name}" aponta para rota inexistente (${shortcut.url}).`);
    }
  });
}

// ---------- 2. service-worker.js ----------

const swPath = path.join(FRONTEND, "service-worker.js");
if (!fs.existsSync(swPath)) {
  fail("frontend/service-worker.js não existe.");
} else {
  const sw = fs.readFileSync(swPath, "utf8");
  if (!/isApiRequest\s*\(url\)\s*\)\s*return/.test(sw) && !sw.includes("isApiRequest(url)) return")) {
    fail("service-worker.js: não encontrei a exclusão explícita de /api/* do cache.");
  }
  if (!sw.includes('"/api/"') && !sw.includes("'/api/'")) {
    fail("service-worker.js: não encontrei o prefixo /api/ tratado como network-only.");
  }
  if (!sw.includes("OFFLINE_URL")) {
    warn("service-worker.js: não encontrei fallback para offline.html.");
  }
  if (sw.includes("cache.put(request") && sw.match(/cache\.put\(request/g).length > 1) {
    warn("service-worker.js: mais de um ponto grava no cache — confira se nenhum deles cobre /api.");
  }
}

// ---------- 3. offline.html ----------

if (!exists("offline.html")) fail("frontend/offline.html não existe.");

// ---------- 4. Ícones obrigatórios ----------

[
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png",
  "assets/icons/apple-touch-icon.png",
].forEach((iconPath) => {
  if (!exists(iconPath)) fail(`Ícone obrigatório ausente: frontend/${iconPath}`);
});

// ---------- 5. Páginas administrativas ----------

const PAGES_WITH_SHELL = [
  "index.html",
  "vehicles.html",
  "vehicle-form.html",
  "leads.html",
  "customers.html",
  "proposals.html",
  "sales.html",
  "documentation.html",
  "despachante.html",
  "despachante-detail.html",
  "ai.html",
  "settings.html",
];

const ALL_PAGES = [...PAGES_WITH_SHELL, "login.html"];

ALL_PAGES.forEach((page) => {
  const filePath = path.join(ADMIN, page);
  if (!fs.existsSync(filePath)) {
    fail(`Página esperada não encontrada: frontend/admin/${page}`);
    return;
  }
  const html = fs.readFileSync(filePath, "utf8");

  const manifestRefs = (html.match(/manifest\.webmanifest/g) || []).length;
  if (manifestRefs === 0) fail(`${page}: não referencia o manifest.webmanifest.`);
  if (manifestRefs > 1) fail(`${page}: manifest.webmanifest referenciado mais de uma vez.`);

  const mobileCssRefs = (html.match(/mobile-app\.css/g) || []).length;
  if (mobileCssRefs === 0) fail(`${page}: não carrega css/mobile-app.css.`);
  if (mobileCssRefs > 1) fail(`${page}: css/mobile-app.css referenciado mais de uma vez.`);

  if (!html.includes("apple-touch-icon")) fail(`${page}: falta o link apple-touch-icon.`);
  if (!html.includes("apple-mobile-web-app-capable")) fail(`${page}: falta meta apple-mobile-web-app-capable.`);
  if (!html.includes('name="theme-color"')) fail(`${page}: falta meta theme-color.`);

  const pwaInstallRefs = (html.match(/pwa-install\.js/g) || []).length;
  if (pwaInstallRefs === 0) fail(`${page}: não carrega js/pwa-install.js.`);
  if (pwaInstallRefs > 1) fail(`${page}: js/pwa-install.js referenciado mais de uma vez.`);

  if (PAGES_WITH_SHELL.includes(page)) {
    const shellRefs = (html.match(/mobile-shell\.js/g) || []).length;
    if (shellRefs === 0) fail(`${page}: não carrega js/mobile-shell.js.`);
    if (shellRefs > 1) fail(`${page}: js/mobile-shell.js referenciado mais de uma vez.`);
  }
});

// ---------- 6. Arquivos-fonte da PWA existem ----------

[
  "admin/js/mobile-shell.js",
  "admin/js/pwa-install.js",
  "admin/css/mobile-app.css",
].forEach((relPath) => {
  if (!exists(relPath)) fail(`Arquivo obrigatório ausente: frontend/${relPath}`);
});

// ---------- Relatório ----------

if (warnings.length) {
  console.log("Avisos:");
  warnings.forEach((message) => console.log("  - " + message));
}

if (failures.length) {
  console.log("\nFalhas:");
  failures.forEach((message) => console.log("  - " + message));
  console.log(`\n${failures.length} verificação(ões) falharam.`);
  process.exit(1);
}

console.log("Todas as verificações estáticas da PWA passaram.");
