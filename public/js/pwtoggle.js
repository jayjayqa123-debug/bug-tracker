// Adds a Show/Hide button to every password field on the page.
(function () {
  document.querySelectorAll('input[type="password"]').forEach(input => {
    if (input.parentElement.classList.contains('pw-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.textContent = 'Show';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    btn.onclick = () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', String(show));
    };
    wrap.appendChild(btn);
  });
})();
