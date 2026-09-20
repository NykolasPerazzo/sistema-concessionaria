(() => {
  const retryButton = document.getElementById("offlineRetryButton");
  if (!retryButton) return;

  retryButton.addEventListener("click", () => {
    window.location.reload();
  });

  window.addEventListener("online", () => {
    window.location.reload();
  });
})();
