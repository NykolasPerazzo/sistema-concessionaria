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

  return "https://car-dealer-z468.onrender.com/api";
})();
