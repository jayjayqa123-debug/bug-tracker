// Tells the server this person is online (every 30s while the page is open).
(function () {
  const token = localStorage.getItem('token');
  if (!token) return;
  const headers = { Authorization: 'Bearer ' + token };
  let timer = null;

  function ping() {
    fetch('/api/presence/ping', { method: 'POST', headers })
      .then(r => { if (r.status === 401) clearInterval(timer); })
      .catch(() => {});
  }
  timer = setInterval(ping, 30000);
  ping();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ping(); });

  // Logging out marks the person offline straight away
  const out = document.getElementById('logoutBtn');
  if (out) out.addEventListener('click', () => {
    clearInterval(timer);
    fetch('/api/presence/offline', { method: 'POST', headers, keepalive: true }).catch(() => {});
  }, true);
})();
