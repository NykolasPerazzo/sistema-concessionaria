/*
 * Configuração da API
 */

const API_URL = (() => {
  const { hostname } = window.location;

  const isLocalNetwork =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);

  if (isLocalNetwork) {
    return `http://${hostname}:3000/api`;
  }

  /*
   * Em produção usamos um caminho relativo. Quando o site é acessado
   * pela Vercel, o vercel.json faz o rewrite de /api/* para o Render,
   * então a chamada vira same-origin do ponto de vista do navegador —
   * isso evita que o cookie de sessão (SameSite=None) seja bloqueado
   * por navegadores mobile (Safari/iOS, Chrome com bloqueio de cookies
   * de terceiros). Quando acessado direto pelo Render, /api também
   * funciona pois o próprio backend serve o frontend e a API juntos.
   */
  return "/api";
})();
