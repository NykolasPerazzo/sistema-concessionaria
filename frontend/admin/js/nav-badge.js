(() => {
  const badge = document.getElementById("leadsNavBadge");
  if (!badge) return;

  let count = 0;
  let reconnectTimeout = null;

  function paint() {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count <= 0;
  }

  async function loadCount() {
    try {
      const response = await fetch(`${API_URL}/leads`, {
        credentials: "include",
      });
      if (!response.ok) return;
      const data = await response.json();
      count = (data.leads || []).filter((l) => l.status === "new").length;
      paint();
    } catch {
      // Silencioso: a página atual já trata falhas de autenticação/rede.
    }
  }

  function connectStream() {
    const source = new EventSource(`${API_URL}/leads/stream`, {
      withCredentials: true,
    });

    source.addEventListener("new_lead", () => {
      count += 1;
      paint();
    });

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        source.close();
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectStream, 5000);
      }
    };
  }

  document.addEventListener("leads:new-count", (event) => {
    count = event.detail;
    paint();
  });

  loadCount();
  connectStream();
})();
