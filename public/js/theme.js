// Light / dark mode. The choice is remembered on this device.
(function () {
  const KEY = 'bt-theme';
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
  if (saved === 'dark') root.setAttribute('data-theme', 'dark');   // applied before the page paints (no flash)

  function isDark() { return root.getAttribute('data-theme') === 'dark'; }

  function paint(btn) {
    btn.textContent = isDark() ? '☀️' : '🌙';
    btn.title = isDark() ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', btn.title);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark() ? '#0b1522' : '#1d4ed8');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'themeBtn';
    const bar = document.querySelector('.top-actions');
    if (bar) { btn.className = 'theme-btn'; bar.insertBefore(btn, bar.firstChild); }
    else { btn.className = 'theme-btn floating'; document.body.appendChild(btn); }   // login / shared pages
    paint(btn);
    btn.addEventListener('click', () => {
      if (isDark()) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', 'dark');
      try { localStorage.setItem(KEY, isDark() ? 'dark' : 'light'); } catch (e) { /* ignore */ }
      paint(btn);
    });
  });
})();
