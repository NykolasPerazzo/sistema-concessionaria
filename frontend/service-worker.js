/*
 * Service Worker do Car Dealer IA.
 *
 * Regras (propositais, não alterar sem revisar a política de cache):
 * - /api/* nunca é interceptado: sempre vai direto para a rede.
 * - Documentos HTML usam network-first e NUNCA são gravados no cache
 *   (evita servir uma página privada em cache para outra pessoa após logout).
 * - CSS/JS/ícones locais usam stale-while-revalidate.
 * - Qualquer outra origem (CDN, Cloudinary, /uploads) não é interceptada.
 */

const CACHE_VERSION = "v1";
const CACHE_NAME = `car-dealer-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/icon-maskable-512.png",
  "/assets/icons/apple-touch-icon.png",
];

const STATIC_PREFIXES = [
  "/admin/css/",
  "/admin/js/",
  "/css/",
  "/js/",
  "/assets/icons/",
  "/assets/fonts/",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("car-dealer-static-") && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  if (url.pathname === "/manifest.webmanifest") return true;
  return STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const offline = await cache.match(OFFLINE_URL);
    return offline || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    // Atualiza em segundo plano sem bloquear a resposta.
    networkFetch.catch(() => {});
    return cached;
  }

  const fresh = await networkFetch;
  return fresh || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;

  const acceptsHtml = (request.headers.get("accept") || "").includes(
    "text/html",
  );
  const isNavigation = request.mode === "navigate" || acceptsHtml;

  if (isNavigation) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});
