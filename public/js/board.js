const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || 'null');
if (!token || !user) window.location.href = 'index.html';

const authHeaders = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };

const ALL_STATUSES = [
  'On Filing',
  'Filed Ticket List',
  'Filed Ticket List for Host',
  'Working in Progress by Dev',
  'Complete (For Retest)',
  'Reactive',
  'Backend Issue',
  'Closed'
];

let currentPlatform = 'Android';
let tickets = [];
let devs = [];
let editingId = null;
let currentAttachments = []; // saved attachments of the ticket being edited
let pendingAttachments = []; // attachments queued while filing a new ticket

document.getElementById('whoAmI').textContent = `${user.name} (${user.role})`;
if (user.role !== 'QA') document.getElementById('newTicketBtn').style.display = 'none';
document.getElementById('fabAdd').style.display = user.role === 'QA' ? 'block' : 'none';

document.getElementById('logoutBtn').onclick = () => {
  localStorage.removeItem('token'); localStorage.removeItem('user');
  window.location.href = 'index.html';
};

document.querySelectorAll('#platformTabs button').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('#platformTabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPlatform = btn.dataset.platform;
    loadAll();
  };
});

function visibleStatuses() {
  // "Filed Ticket List for Host" only applies to Android and iOS, not Web
  if (currentPlatform === 'Web') return ALL_STATUSES.filter(s => s !== 'Filed Ticket List for Host');
  return ALL_STATUSES;
}

async function loadDevs() {
  const res = await fetch(`/api/tickets/devs?platform=${currentPlatform}`, { headers: authHeaders });
  devs = await res.json();
  const sel = document.getElementById('tAssignee');
  sel.innerHTML = '<option value="">Unassigned</option>' + devs.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
}

async function loadStats() {
  const res = await fetch(`/api/export/stats?platform=${currentPlatform}`, { headers: authHeaders });
  const s = await res.json();
  const bar = document.getElementById('statsBar');
  const cards = [
    ['Filed Today', s.filedToday], ['Fixed Today', s.fixedToday],
    ['Still Active', s.stillActive], ['Closed Today', s.closedToday],
    ['Pending Regression', s.pendingRegression], ['Total', s.total]
  ];
  bar.innerHTML = cards.map(([label, num]) => `
    <div class="stat-card"><div class="num">${num}</div><div class="label">${label}</div></div>
  `).join('');
}

async function loadTickets() {
  const res = await fetch(`/api/tickets?platform=${currentPlatform}`, { headers: authHeaders });
  tickets = await res.json();
  renderBoard();
}

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  visibleStatuses().forEach(status => {
    const col = document.createElement('div');
    col.className = 'column';
    const inColumn = tickets.filter(t => t.status === status);
    col.innerHTML = `<div class="column-header"><span>${status}</span><span>${inColumn.length}</span></div>
      <div class="column-body" data-status="${status}"></div>`;
    board.appendChild(col);
    const body = col.querySelector('.column-body');

    body.addEventListener('dragover', e => { e.preventDefault(); body.classList.add('dragover'); });
    body.addEventListener('dragleave', () => body.classList.remove('dragover'));
    body.addEventListener('drop', async e => {
      e.preventDefault(); body.classList.remove('dragover');
      const id = e.dataTransfer.getData('text/plain');
      await fetch(`/api/tickets/${id}/status`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ status }) });
      loadTickets(); loadStats();
    });

    inColumn.forEach(t => body.appendChild(renderCard(t)));
  });
}

function assigneeName(id) {
  const d = devs.find(x => x.id === id);
  return d ? d.name : 'Unassigned';
}

function renderCard(t) {
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', t.id));
  card.innerHTML = `
    <div class="tno">${escapeHtml(t.ticket_number || '')}</div>
    <h4>${escapeHtml(t.title)}</h4>
    <div class="badges">
      <span class="badge prio-${t.priority}">${t.priority}</span>
      <span class="badge sev-${t.severity}">${t.severity}</span>
    </div>
    <div class="meta">
      <span>👤 ${assigneeName(t.assignee_id)}${(t.attachments && t.attachments.length) ? ` · 📎 ${t.attachments.length}` : ''}</span>
      <button class="share-btn" data-token="${t.share_token}">🔗 Share</button>
    </div>
    <div class="meta"><span>Filed by ${escapeHtml(t.filed_by_name || '')}</span></div>
  `;
  card.querySelector('.share-btn').onclick = (e) => {
    e.stopPropagation();
    const link = `${window.location.origin}/share.html?token=${t.share_token}`;
    navigator.clipboard.writeText(link).then(() => alert('Share link copied:\n' + link));
  };
  card.onclick = () => openModal(t);
  return card;
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ---------- Modal ----------
const overlay = document.getElementById('ticketOverlay');
const form = document.getElementById('ticketForm');

function fillStatusSelect() {
  const sel = document.getElementById('tStatus');
  sel.innerHTML = visibleStatuses().map(s => `<option value="${s}">${s}</option>`).join('');
}

function openModal(ticket) {
  fillStatusSelect();
  editingId = ticket ? ticket.id : null;
  document.getElementById('modalTitle').textContent = ticket ? 'Ticket Details' : 'File New Ticket';
  const numInput = document.getElementById('tNumber');
  if (ticket) {
    numInput.value = ticket.ticket_number || '';
  } else {
    numInput.value = 'Assigned automatically…';
    fetch(`/api/tickets/next-number?platform=${currentPlatform}`, { headers: authHeaders })
      .then(r => r.json())
      .then(d => { if (d.ticket_number && !editingId) numInput.value = d.ticket_number; })
      .catch(() => {});
  }
  document.getElementById('tTitle').value = ticket ? ticket.title : '';
  document.getElementById('tDescription').value = ticket ? ticket.description : '';
  document.getElementById('tPriority').value = ticket ? ticket.priority : 'Medium';
  document.getElementById('tSeverity').value = ticket ? ticket.severity : 'Minor';
  document.getElementById('tAssignee').value = ticket ? (ticket.assignee_id || '') : '';
  document.getElementById('tStatus').value = ticket ? ticket.status : 'On Filing';

  const filedByWrap = document.getElementById('filedByWrap');
  const shareWrap = document.getElementById('shareWrap');
  const deleteBtn = document.getElementById('deleteBtn');
  if (ticket) {
    filedByWrap.style.display = 'block';
    document.getElementById('tFiledBy').value = ticket.filed_by_name || '';
    shareWrap.style.display = 'block';
    document.getElementById('tShareLink').value = `${window.location.origin}/share.html?token=${ticket.share_token}`;
    deleteBtn.style.display = user.role === 'QA' ? 'inline-block' : 'none';
  } else {
    filedByWrap.style.display = 'none';
    shareWrap.style.display = 'none';
    deleteBtn.style.display = 'none';
  }
  currentAttachments = ticket ? (ticket.attachments || (ticket.attachments = [])) : [];
  pendingAttachments = [];
  document.getElementById('linkRow').style.display = 'none';
  setAttachStatus('');
  renderAttachments();
  overlay.classList.add('open');
  autoGrow(); // must run after the modal is visible so scrollHeight is correct
}

function closeModal() {
  overlay.classList.remove('open'); editingId = null; form.reset();
  pendingAttachments.forEach(p => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
  pendingAttachments = []; currentAttachments = [];
}

document.getElementById('cancelBtn').onclick = closeModal;
document.getElementById('newTicketBtn').onclick = () => openModal(null);
document.getElementById('fabAdd').onclick = () => openModal(null);

document.getElementById('deleteBtn').onclick = async () => {
  if (!editingId) return;
  if (!confirm('Delete this ticket permanently?')) return;
  await fetch(`/api/tickets/${editingId}`, { method: 'DELETE', headers: authHeaders });
  closeModal(); loadTickets(); loadStats();
};

form.onsubmit = async (e) => {
  e.preventDefault();
  const saveBtn = form.querySelector('.btn-save');
  const payload = {
    title: document.getElementById('tTitle').value,
    description: document.getElementById('tDescription').value,
    priority: document.getElementById('tPriority').value,
    severity: document.getElementById('tSeverity').value,
    assignee_id: document.getElementById('tAssignee').value || null
  };

  saveBtn.disabled = true;
  try {
    if (editingId) {
      await fetch(`/api/tickets/${editingId}`, { method: 'PUT', headers: authHeaders, body: JSON.stringify(payload) });
      const newStatus = document.getElementById('tStatus').value;
      await fetch(`/api/tickets/${editingId}/status`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ status: newStatus }) });
    } else {
      payload.platform = currentPlatform;
      const res = await fetch('/api/tickets', { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }

      // Ticket is saved - now send the attachments queued while filing it
      const failed = [];
      for (let i = 0; i < pendingAttachments.length; i++) {
        const p = pendingAttachments[i];
        setAttachStatus(`Uploading attachment ${i + 1} of ${pendingAttachments.length}…`);
        try {
          if (p.type === 'link') await postLink(data.id, p.url);
          else await uploadFile(data.id, p.file);
        } catch (err) { failed.push(`${p.name}: ${err.message}`); }
      }
      if (failed.length) alert('Ticket saved, but some attachments failed:\n' + failed.join('\n'));
    }
  } finally {
    saveBtn.disabled = false;
  }
  closeModal();
  loadTickets(); loadStats();
};

// ---------- Description: expand to show the full text ----------
const descEl = document.getElementById('tDescription');
function autoGrow() {
  descEl.style.height = 'auto';
  descEl.style.height = descEl.scrollHeight + 'px';
}
descEl.addEventListener('input', autoGrow);
window.addEventListener('resize', () => { if (overlay.classList.contains('open')) autoGrow(); });

// ---------- Attachments (link / image / video) ----------
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 100 * 1024 * 1024;
const attachList = document.getElementById('attachList');

function setAttachStatus(msg) { document.getElementById('attachStatus').textContent = msg; }

function isHttpUrl(u) {
  try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch (e) { return false; }
}

async function postLink(ticketId, url) {
  const res = await fetch(`/api/tickets/${ticketId}/attachments/link`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ url })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not add link');
  return data;
}

async function uploadFile(ticketId, file) {
  const res = await fetch(`/api/tickets/${ticketId}/attachments/file`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': file.type,
      'X-Filename': encodeURIComponent(file.name)
    },
    body: file
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

function attachItemEl(a, onRemove, pending) {
  const el = document.createElement('div');
  el.className = 'attach-item';
  const src = a.previewUrl || a.url;
  if (a.type === 'image') {
    const link = document.createElement('a');
    link.href = src; link.target = '_blank'; link.rel = 'noopener';
    const img = document.createElement('img');
    img.src = src; img.alt = a.name || 'image';
    link.appendChild(img); el.appendChild(link);
  } else if (a.type === 'video') {
    const v = document.createElement('video');
    v.src = src; v.controls = true; v.preload = 'metadata';
    el.appendChild(v);
  } else {
    const link = document.createElement('a');
    link.className = 'link';
    link.textContent = '🔗 ' + (a.name || a.url);
    if (isHttpUrl(a.url)) { link.href = a.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    el.appendChild(link);
  }
  if (a.type !== 'link' && a.name) {
    const f = document.createElement('div'); f.className = 'fname'; f.textContent = a.name; el.appendChild(f);
  }
  if (pending) {
    const t = document.createElement('div'); t.className = 'pending-tag';
    t.textContent = 'Will upload when you save'; el.appendChild(t);
  }
  const rm = document.createElement('button');
  rm.type = 'button'; rm.className = 'rm'; rm.title = 'Remove'; rm.textContent = '✕';
  rm.onclick = onRemove;
  el.appendChild(rm);
  return el;
}

function renderAttachments() {
  attachList.innerHTML = '';
  currentAttachments.forEach(a => {
    attachList.appendChild(attachItemEl(a, async () => {
      if (!confirm('Remove this attachment?')) return;
      const res = await fetch(`/api/tickets/${editingId}/attachments/${a.id}`, { method: 'DELETE', headers: authHeaders });
      if (!res.ok) { alert('Could not remove attachment'); return; }
      currentAttachments.splice(currentAttachments.indexOf(a), 1);
      renderAttachments(); renderBoard();
    }, false));
  });
  pendingAttachments.forEach(p => {
    attachList.appendChild(attachItemEl(p, () => {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      pendingAttachments.splice(pendingAttachments.indexOf(p), 1);
      renderAttachments();
    }, true));
  });
}

async function addFiles(type, fileList) {
  const limit = type === 'image' ? MAX_IMAGE : MAX_VIDEO;
  const limitLabel = type === 'image' ? '10 MB' : '100 MB';
  for (const file of Array.from(fileList)) {
    if (!file.type.startsWith(type + '/')) { alert(`"${file.name}" is not a ${type} file.`); continue; }
    if (file.size > limit) { alert(`"${file.name}" is too large (max ${limitLabel} per ${type}).`); continue; }
    if (editingId) {
      // Ticket already saved: upload straight away
      setAttachStatus(`Uploading ${file.name}…`);
      try {
        currentAttachments.push(await uploadFile(editingId, file));
        renderAttachments(); renderBoard();
      } catch (err) { alert(`Could not upload "${file.name}": ${err.message}`); }
      setAttachStatus('');
    } else {
      // New ticket: queue until the ticket is saved
      pendingAttachments.push({ type, file, name: file.name, previewUrl: URL.createObjectURL(file) });
      renderAttachments();
    }
  }
}

document.getElementById('addImageBtn').onclick = () => document.getElementById('imageInput').click();
document.getElementById('addVideoBtn').onclick = () => document.getElementById('videoInput').click();
document.getElementById('imageInput').onchange = e => { addFiles('image', e.target.files); e.target.value = ''; };
document.getElementById('videoInput').onchange = e => { addFiles('video', e.target.files); e.target.value = ''; };

const linkRow = document.getElementById('linkRow');
const linkInput = document.getElementById('linkInput');
document.getElementById('addLinkBtn').onclick = () => {
  linkRow.style.display = linkRow.style.display === 'none' ? 'flex' : 'none';
  if (linkRow.style.display === 'flex') linkInput.focus();
};

async function addLink() {
  const url = linkInput.value.trim();
  if (!isHttpUrl(url)) { alert('Please enter a valid link starting with http:// or https://'); return; }
  if (editingId) {
    try {
      currentAttachments.push(await postLink(editingId, url));
      renderAttachments(); renderBoard();
    } catch (err) { alert(err.message); return; }
  } else {
    pendingAttachments.push({ type: 'link', url, name: url });
    renderAttachments();
  }
  linkInput.value = '';
}
document.getElementById('linkAddBtn').onclick = addLink;
linkInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } });

// A plain window.open can't send an Authorization header, so fetch the CSV
// with the header and trigger the download manually instead.
document.getElementById('exportBtn').onclick = async () => {
  const res = await fetch(`/api/export/csv?platform=${currentPlatform}`, { headers: authHeaders });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `bug_report_${currentPlatform}_${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

async function loadAll() {
  await loadDevs();
  await loadTickets();
  await loadStats();
}

loadAll();
