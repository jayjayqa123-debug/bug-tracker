const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

const forgotForm = document.getElementById('forgotForm');
const changeForm = document.getElementById('changeForm');
const tabsEl = document.querySelector('.tabs');

let storedUser = null;
try { storedUser = JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) {}
const mustChange = !!(storedUser && storedUser.mustChangePassword);

// If already logged in, go straight to the board (unless a password change is required)
if (localStorage.getItem('token') && !mustChange) {
  window.location.href = 'board.html';
}

tabLogin.onclick = () => {
  tabLogin.classList.add('active'); tabRegister.classList.remove('active');
  loginForm.style.display = 'block'; registerForm.style.display = 'none';
};
tabRegister.onclick = () => {
  tabRegister.classList.add('active'); tabLogin.classList.remove('active');
  registerForm.style.display = 'block'; loginForm.style.display = 'none';
};

// ---------------- Forgot password / forced password change ----------------
function showOnly(form) {
  [loginForm, registerForm, forgotForm, changeForm].forEach(f => { f.style.display = f === form ? 'block' : 'none'; });
  tabsEl.style.display = (form === loginForm || form === registerForm) ? 'flex' : 'none';
  document.getElementById('googleArea').style.display = (form === loginForm && window.__googleReady) ? 'block' : 'none';
}
document.getElementById('forgotLink').onclick = (e) => { e.preventDefault(); showOnly(forgotForm); };
document.getElementById('forgotBack').onclick = (e) => { e.preventDefault(); showOnly(loginForm); tabLogin.click(); };

forgotForm.onsubmit = async (e) => {
  e.preventDefault();
  const msg = document.getElementById('forgotMsg');
  msg.textContent = ''; msg.className = 'msg';
  try {
    const res = await fetch('/api/auth/forgot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.getElementById('forgotEmail').value })
    });
    const data = await res.json();
    msg.textContent = data.message || data.error;
    msg.className = 'msg ' + (res.ok ? 'ok' : 'err');
  } catch (err) {
    msg.textContent = 'Could not reach the server.'; msg.className = 'msg err';
  }
};

changeForm.onsubmit = async (e) => {
  e.preventDefault();
  const msg = document.getElementById('changeMsg');
  msg.textContent = ''; msg.className = 'msg';
  const newPassword = document.getElementById('chgNew').value;
  if (newPassword !== document.getElementById('chgConfirm').value) {
    msg.textContent = 'The new passwords do not match.'; msg.className = 'msg err'; return;
  }
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ currentPassword: document.getElementById('chgCurrent').value, newPassword })
    });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.error; msg.className = 'msg err'; return; }
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = 'board.html';
  } catch (err) {
    msg.textContent = 'Could not reach the server.'; msg.className = 'msg err';
  }
};
document.getElementById('chgSignOut').onclick = (e) => {
  e.preventDefault();
  localStorage.removeItem('token'); localStorage.removeItem('user');
  window.location.reload();
};
if (localStorage.getItem('token') && mustChange) showOnly(changeForm);

const regRole = document.getElementById('regRole');
const regPlatformWrap = document.getElementById('regPlatformWrap');
function togglePlatformField() {
  regPlatformWrap.style.display = regRole.value === 'Dev' ? 'block' : 'none';
}
regRole.addEventListener('change', togglePlatformField);
togglePlatformField();

loginForm.onsubmit = async (e) => {
  e.preventDefault();
  const msg = document.getElementById('loginMsg');
  msg.textContent = ''; msg.className = 'msg';
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.error; msg.className = 'msg err'; return; }
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    if (data.user.mustChangePassword) {
      document.getElementById('chgCurrent').value = password;
      showOnly(changeForm);
      return;
    }
    window.location.href = 'board.html';
  } catch (err) {
    msg.textContent = 'Could not reach the server.'; msg.className = 'msg err';
  }
};

registerForm.onsubmit = async (e) => {
  e.preventDefault();
  const msg = document.getElementById('registerMsg');
  msg.textContent = ''; msg.className = 'msg';
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;
  const role = document.getElementById('regRole').value;
  const platform = document.getElementById('regPlatform').value;
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role, platform: role === 'Dev' ? platform : undefined })
    });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.error; msg.className = 'msg err'; return; }
    msg.textContent = 'Account created! You can sign in now.'; msg.className = 'msg ok';
    registerForm.reset();
    setTimeout(() => tabLogin.click(), 1200);
  } catch (err) {
    msg.textContent = 'Could not reach the server.'; msg.className = 'msg err';
  }
};


// ---------------- Google sign-in / sign-up ----------------
const googleArea = document.getElementById('googleArea');
const googleCompleteForm = document.getElementById('googleCompleteForm');
const gRole = document.getElementById('gRole');
const gPlatformWrap = document.getElementById('gPlatformWrap');
let googleSignupToken = null;

function toggleGPlatform() { gPlatformWrap.style.display = gRole.value === 'Dev' ? 'block' : 'none'; }
gRole.addEventListener('change', toggleGPlatform);
toggleGPlatform();

function finishLogin(data) {
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  window.location.href = 'board.html';
}

async function onGoogleCredential(response) {
  const msg = document.getElementById(googleCompleteForm.style.display === 'block' ? 'googleMsg' : 'loginMsg');
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Google sign-in failed'); return; }
    if (data.token) return finishLogin(data);
    if (data.needsProfile) {
      googleSignupToken = data.signupToken;
      document.getElementById('googleWelcome').textContent =
        'Welcome, ' + data.name + '! Tell us your role to finish creating your account.';
      document.querySelector('.tabs').style.display = 'none';
      googleArea.style.display = 'none';
      loginForm.style.display = 'none';
      registerForm.style.display = 'none';
      googleCompleteForm.style.display = 'block';
    }
  } catch (err) {
    alert('Could not reach the server.');
  }
}

googleCompleteForm.onsubmit = async (e) => {
  e.preventDefault();
  const msg = document.getElementById('googleMsg');
  msg.textContent = ''; msg.className = 'msg';
  const role = gRole.value;
  try {
    const res = await fetch('/api/auth/google/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signupToken: googleSignupToken, role,
        platform: role === 'Dev' ? document.getElementById('gPlatform').value : undefined
      })
    });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.error; msg.className = 'msg err'; return; }
    finishLogin(data);
  } catch (err) {
    msg.textContent = 'Could not reach the server.'; msg.className = 'msg err';
  }
};

(async function initGoogle() {
  try {
    const cfg = await (await fetch('/api/auth/config')).json();
    if (!cfg.googleClientId) return; // not configured: manual sign-in only
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: onGoogleCredential });
      google.accounts.id.renderButton(document.getElementById('googleBtn'),
        { theme: 'filled_black', size: 'large', text: 'continue_with', width: 340 });
      window.__googleReady = true;
      if (loginForm.style.display !== 'none') googleArea.style.display = 'block';
    };
    document.head.appendChild(script);
  } catch (e) { /* manual sign-in still works */ }
})();
