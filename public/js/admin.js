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
function ago(sec) {
  if (sec === null || sec === undefined) return 'never signed in';
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
  if (sec < 86400) return Math.floor(sec / 3600) + ' h ago';
  return Math.floor(sec / 86400) + ' d ago';
}
function fmt(d) { return d ? new Date(d.replace(' ', 'T')).toLocaleDateString() : ''; }

function render() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  const role = document.getElementById('roleFilter').value;
  const list = users.filter(u =>
    (!role || u.role === role) &&
    (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
  const pending = users.filter(u => u.reset_requested_at).length;
  const onlineNow = users.filter(u => u.is_online).length;
  document.getElementById('summary').textContent =
    `${list.length} of ${users.length} accounts · ${onlineNow} online now` + (pending ? ` · ${pending} password reset request${pending > 1 ? 's' : ''} waiting` : '');

  rows.innerHTML = '';
  if (!list.length) { const tr = document.createElement('tr'); cell(tr, 'No matching accounts.').colSpan = 9; rows.appendChild(tr); return; }
  list.forEach(u => {
    const tr = document.createElement('tr');
    if (u.reset_requested_at) tr.className = 'requested';
    cell(tr, u.name);
    cell(tr, u.email);
    cell(tr, u.role);
    cell(tr, u.platform || '—');
    const presence = document.createElement('td');
    presence.className = 'presence-cell';
    if (u.is_online) {
      presence.appendChild(pill('● Online', 'online'));
    } else {
      presence.appendChild(pill('○ Offline', 'offline'));
      const seen = document.createElement('div');
      seen.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:2px;';
      seen.textContent = u.seen_ago_s === null ? 'No activity recorded yet' : 'Last seen ' + ago(u.seen_ago_s);
      presence.appendChild(seen);
    }
    tr.appendChild(presence);
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
    const wrap = document.createElement('div');
    wrap.className = 'act-wrap';
    wrap.appendChild(btn);

    const del = document.createElement('button');
    del.className = 'btn-small danger'; del.textContent = 'Delete';
    if (u.is_me) { del.disabled = true; del.title = 'You cannot delete your own account'; }
    else if (u.is_admin) { del.disabled = true; del.title = 'QA Admin accounts cannot be deleted'; }
    else if (u.filed_count > 0) { del.disabled = true; del.title = `Filed ${u.filed_count} ticket(s) - kept, so this account cannot be deleted`; }
    del.onclick = () => deleteUser(u, del);
    wrap.appendChild(del);
    act.appendChild(wrap);
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
      cell(tr, 'You do not have QA Admin access. Ask the site owner to add your email to ADMIN_EMAILS.').colSpan = 9;
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

async function deleteUser(u, btn) {
  const extra = u.assigned_count ? `\n\n${u.assigned_count} ticket(s) assigned to them will become Unassigned (the tickets are kept).` : '';
  const online = u.is_online ? '\n\n⚠ This person is online right now.' : '';
  if (!confirm(`Delete the account for ${u.name} (${u.email})?\n\nThey will no longer be able to sign in.${extra}${online}`)) return;
  btn.disabled = true;
  try {
    const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE', headers: authHeaders });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || 'Could not delete the account'); btn.disabled = false; return; }
    load();
  } catch (e) {
    alert('Could not reach the server.');
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
setInterval(load, 30000);   // keep online/offline up to date


// ---- Combined ticket totals (Android + iOS + Web) ----
async function loadTotals() {
  try {
    const res = await fetch('/api/admin/stats', { headers: authHeaders });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const s = await res.json();
    const set = (id, v) => { document.getElementById(id).textContent = v ?? 0; };
    set('aFiled', s.filedToday); set('aFixed', s.fixedToday); set('aActive', s.stillActive);
    set('aReactive', s.reactive); set('aClosed', s.closedToday); set('aPending', s.pendingRegression);
    set('aTotalClosed', s.totalClosed); set('aTotal', s.total);
    if (s.closedByPlatform) {
      document.getElementById('closedBreakdown').textContent = 'Total closed by platform: ' +
        Object.entries(s.closedByPlatform).map(([p, n]) => `${p} ${n}`).join(' · ');
    }
    document.getElementById('statsStamp').textContent = '· updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    console.error('Totals error:', e);
    document.getElementById('statsStamp').textContent = '· could not load';
  }
}
loadTotals();
setInterval(loadTotals, 30000);
