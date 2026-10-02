const token = localStorage.getItem('token');
const me = JSON.parse(localStorage.getItem('user') || 'null');
if (!token || !me) window.location.href = 'index.html';
const authHeaders = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };

document.getElementById('whoAmI').textContent = me ? `${me.name} (${me.role})` : '';
document.getElementById('backBtn').onclick = () => { window.location.href = 'board.html'; };

let users = [];
const rows = document.getElementById('userRows');

function cell(tr, text) { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); return td; }
function pill(text, cls) { const s = document.createElement('span'); s.className = 'pill ' + (cls || ''); s.textContent = text; return s; }
function fmt(d) { return d ? new Date(d.replace(' ', 'T')).toLocaleDateString() : ''; }

function render() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  const role = document.getElementById('roleFilter').value;
  const list = users.filter(u =>
    (!role || u.role === role) &&
    (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
  const pending = users.filter(u => u.reset_requested_at).length;
  document.getElementById('summary').textContent =
    `${list.length} of ${users.length} accounts` + (pending ? ` · ${pending} password reset request${pending > 1 ? 's' : ''} waiting` : '');

  rows.innerHTML = '';
  if (!list.length) { const tr = document.createElement('tr'); cell(tr, 'No matching accounts.').colSpan = 8; rows.appendChild(tr); return; }
  list.forEach(u => {
    const tr = document.createElement('tr');
    if (u.reset_requested_at) tr.className = 'requested';
    cell(tr, u.name);
    cell(tr, u.email);
    cell(tr, u.role);
    cell(tr, u.platform || '—');
    const signin = document.createElement('td');
    if (u.has_password) signin.appendChild(pill('Password'));
    if (u.has_google) { signin.appendChild(document.createTextNode(' ')); signin.appendChild(pill('Google', 'info')); }
    tr.appendChild(signin);
    const status = document.createElement('td');
    if (u.reset_requested_at) status.appendChild(pill('Reset requested ' + fmt(u.reset_requested_at), 'warn'));
    else if (u.must_change_password) status.appendChild(pill('Temp password issued', 'info'));
    else status.textContent = '—';
    tr.appendChild(status);
    cell(tr, fmt(u.created_at));
    const act = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn-small'; btn.textContent = 'Reset password';
    if (!u.has_password) { btn.disabled = true; btn.title = 'Google-only account: no password to reset'; }
    btn.onclick = () => resetPassword(u, btn);
    act.appendChild(btn);
    tr.appendChild(act);
    rows.appendChild(tr);
  });
}

async function load() {
  try {
    const res = await fetch('/api/admin/users', { headers: authHeaders });
    if (res.status === 401) { localStorage.clear(); window.location.href = 'index.html'; return; }
    if (res.status === 403) {
      rows.innerHTML = '';
      const tr = document.createElement('tr');
      cell(tr, 'You do not have QA Admin access. Ask the site owner to add your email to ADMIN_EMAILS.').colSpan = 8;
      rows.appendChild(tr); return;
    }
    users = await res.json();
    render();
  } catch (e) {
    rows.innerHTML = '<tr><td colspan="8">Could not reach the server.</td></tr>';
  }
}

async function resetPassword(u, btn) {
  if (!confirm(`Reset the password for ${u.name} (${u.email})?\n\nTheir current password will stop working.`)) return;
  btn.disabled = true;
  try {
    const res = await fetch(`/api/admin/users/${u.id}/reset-password`, { method: 'POST', headers: authHeaders });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Could not reset password'); return; }
    document.getElementById('pwFor').textContent = `New temporary password for ${data.name} (${u.email}):`;
    document.getElementById('pwValue').textContent = data.temporaryPassword;
    document.getElementById('pwOverlay').classList.add('open');
    load();
  } catch (e) {
    alert('Could not reach the server.');
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('pwCopy').onclick = () => {
  const pw = document.getElementById('pwValue').textContent;
  navigator.clipboard.writeText(pw).then(() => { document.getElementById('pwCopy').textContent = 'Copied ✓'; });
};
document.getElementById('pwClose').onclick = () => {
  document.getElementById('pwOverlay').classList.remove('open');
  document.getElementById('pwValue').textContent = '';
  document.getElementById('pwCopy').textContent = 'Copy';
};
document.getElementById('search').addEventListener('input', render);
document.getElementById('roleFilter').addEventListener('change', render);

load();
