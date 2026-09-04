/*
 * Detecta o ambiente pelo endereço usado para
 * acessar o site, em vez de fixar um IP.
 *
 * - Rede local (localhost/127.0.0.1/192.168.x.x/10.x.x.x):
 *   aponta para o backend na porta 3000 do mesmo host.
 * - Qualquer outro domínio (produção): assume que o
 *   backend responde em /api no mesmo domínio.
 */
const API_URL = (() => {
  const { hostname, protocol } = window.location;

  const isLocalNetwork =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);

  if (isLocalNetwork) {
    return `http://${hostname}:3000/api`;
  }

  return `${protocol}//${hostname}/api`;
})();
