document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('whoAmI').textContent = `${user.name || 'User'} (${user.role || 'QA'})`;
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'board.html';
  });

  const userRows = document.getElementById('userRows');
  const searchInput = document.getElementById('search');
  const roleFilter = document.getElementById('roleFilter');
  const summary = document.getElementById('summary');

  const pwOverlay = document.getElementById('pwOverlay');
  const pwFor = document.getElementById('pwFor');
  const pwValue = document.getElementById('pwValue');
  const pwCopy = document.getElementById('pwCopy');
  const pwClose = document.getElementById('pwClose');

  let allUsers = [];

  async function loadUsers() {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      allUsers = await res.json();
      renderTable();
    } catch (err) {
      userRows.innerHTML = `<tr><td colspan="8" style="color:var(--urgent, #ef4444);">Error loading user accounts.</td></tr>`;
    }
  }

  function renderTable() {
    const query = searchInput.value.toLowerCase().trim();
    const role = roleFilter.value;

    const filtered = allUsers.filter(u => {
      const matchSearch = u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query);
      const matchRole = !role || u.role === role;
      return matchSearch && matchRole;
    });

    summary.textContent = `${filtered.length} of ${allUsers.length} accounts`;

    if (filtered.length === 0) {
      userRows.innerHTML = `<tr><td colspan="8">No matching user accounts found.</td></tr>`;
      return;
    }

    userRows.innerHTML = filtered.map(u => `
      <tr>
        <td><strong>${escapeHtml(u.name)}</strong></td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="badge-role ${u.role}">${u.role}</span></td>
        <td>${u.platform || '—'}</td>
        <td>${u.googleId ? 'Google' : 'Password'}</td>
        <td>${u.mustChangePassword ? 'Pending Reset' : 'Active'}</td>
        <td>${new Date(u.createdAt || Date.now()).toLocaleDateString()}</td>
        <td>
          <button class="btn-reset-pw" onclick="resetPassword('${u.id}', '${escapeHtml(u.email)}')">Reset password</button>
        </td>
      </tr>
    `).join('');
  }

  window.resetPassword = async (userId, email) => {
    if (!confirm(`Are you sure you want to reset the password for ${email}?`)) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      pwFor.textContent = `Temporary password generated for ${email}:`;
      pwValue.textContent = data.tempPassword;
      pwOverlay.classList.add('open');
      loadUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  pwCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(pwValue.textContent);
    pwCopy.textContent = 'Copied!';
    setTimeout(() => { pwCopy.textContent = 'Copy'; }, 1500);
  });

  pwClose.addEventListener('click', () => {
    pwOverlay.classList.remove('open');
  });

  searchInput.addEventListener('input', renderTable);
  roleFilter.addEventListener('change', renderTable);

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  loadUsers();
});
