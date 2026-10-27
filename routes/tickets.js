const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authRequired, qaRequired } = require('../middleware/auth');
const { nextNumber, peekNumber } = require('../db/ticketNumber');
const { logActivity, userNames } = require('../db/activity');
const { router: attachmentsRouter, attachmentsFor, removeFile } = require('./attachments');
const commentsRouter = require('./comments');

const router = express.Router();

// Board columns for each platform (Web has no "for Host" column; 77 Live has a single "Filed Ticket List")
const STATUSES_BY_PLATFORM = {
  'Android': [
    'On Filing', 'Filed Ticket List (Game 99 Vertical)', 'Filed Ticket List for Host', 'Filed Ticket List (Game 99 Horizontal)',
    'Working in Progress by Dev', 'Reactive', 'Complete (For Retest)', 'Backend Issue', 'Closed'
  ],
  'iOS': [
    'On Filing', 'Filed Ticket List (Game 99 Vertical)', 'Filed Ticket List for Host', 'Filed Ticket List (Game 99 Horizontal)',
    'Working in Progress by Dev', 'Reactive', 'Complete (For Retest)', 'Backend Issue', 'Closed'
  ],
  'Web': [
    'On Filing', 'Filed Ticket List (Game 99 Vertical)', 'Filed Ticket List (Game 99 Horizontal)',
    'Working in Progress by Dev', 'Reactive', 'Complete (For Retest)', 'Backend Issue', 'Closed'
  ],
  '77 Live Android': [
    'On Filing', 'Filed Ticket List',
    'Working in Progress by Dev', 'Reactive', 'Complete (For Retest)', 'Backend Issue', 'Closed'
  ],
  '77 Live iOS': [
    'On Filing', 'Filed Ticket List',
    'Working in Progress by Dev', 'Reactive', 'Complete (For Retest)', 'Backend Issue', 'Closed'
  ]
};
const STATUSES = [...new Set(Object.values(STATUSES_BY_PLATFORM).flat())];   // every valid status
const statusesFor = platform => STATUSES_BY_PLATFORM[platform] || STATUSES;

// Allowed platforms for validation - Updated for both 77 Live Android and 77 Live iOS
const ALLOWED_PLATFORMS = ['Android', 'iOS', 'Web', '77 Live Android', '77 Live iOS'];

router.use('/:id/attachments', attachmentsRouter);
router.use('/:id/comments', commentsRouter);

router.get('/statuses', (req, res) => res.json(req.query.platform ? statusesFor(req.query.platform) : STATUSES));

router.get('/devs', authRequired, async (req, res) => {
  try {
    let sql = "SELECT id, name, platform FROM users WHERE role = 'Dev'";
    const params = [];
    if (req.query.platform) {
      sql += ' AND platform = ?';
      params.push(req.query.platform);
    }
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error loading developers' });
  }
});

router.get('/next-number', authRequired, async (req, res) => {
  try {
    if (!ALLOWED_PLATFORMS.includes(req.query.platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    res.json({ ticket_number: await peekNumber(req.query.platform) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/share/:token', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM tickets WHERE share_token = ?', [req.params.token]);
    if (!rows[0]) return res.status(404).json({ error: 'Ticket not found' });
    rows[0].attachments = (await attachmentsFor([rows[0].id]))[rows[0].id];
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error loading ticket' });
  }
});

// Very cheap "has anything changed?" check. The board polls this every few seconds and only
// downloads the full ticket list when the value changes.
router.get('/version', authRequired, async (req, res) => {
  try {
    const p = req.query.platform || null;
    const w = p ? 'WHERE platform = ?' : '';
    const wj = p ? 'WHERE t.platform = ?' : '';
    const params = p ? [p, p, p, p] : [];
    const [[r]] = await pool.execute(
      `SELECT
         (SELECT COUNT(*) FROM tickets ${w}) AS t,
         (SELECT MAX(updated_at) FROM tickets ${w}) AS m,
         (SELECT COUNT(*) FROM attachments a JOIN tickets t ON t.id = a.ticket_id ${wj}) AS a,
         (SELECT COUNT(*) FROM ticket_comments c JOIN tickets t ON t.id = c.ticket_id ${wj}) AS c`,
      params);
    res.json({ v: `${r.t}|${r.m}|${r.a}|${r.c}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Activity feed for one ticket (newest first)
router.get('/:id/activity', authRequired, async (req, res) => {
  try {
    const [tix] = await pool.execute('SELECT id, filed_by_name, created_at FROM tickets WHERE id = ?', [req.params.id]);
    if (!tix[0]) return res.status(404).json({ error: 'Ticket not found' });
    const [rows] = await pool.execute(
      `SELECT id, user_name, user_role, action, details, source, created_at
       FROM ticket_activity WHERE ticket_id = ? ORDER BY created_at DESC, id DESC LIMIT 300`, [req.params.id]);
    const items = rows.map(r => {
      let d = null;
      try { d = r.details ? JSON.parse(r.details) : null; } catch (e) { /* ignore */ }
      return { id: r.id, user_name: r.user_name, user_role: r.user_role, action: r.action, details: d, source: r.source, created_at: r.created_at };
    });
    // Tickets filed before the log existed still show who filed them and when
    if (!items.some(i => i.action === 'created')) {
      items.push({ id: 'created-' + tix[0].id, user_name: tix[0].filed_by_name || 'Someone', user_role: 'QA', action: 'created', details: null, source: 'app', created_at: tix[0].created_at });
    }
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error loading activity' });
  }
});

// Search ticket titles (and ticket numbers) across ALL platforms
router.get('/search', authRequired, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q.length < 2) return res.json([]);
    const like = '%' + q.replace(/[\\%_]/g, m => '\\' + m) + '%';
    const [rows] = await pool.execute(
      `SELECT id, ticket_number, title, platform, status, priority, severity, created_at
       FROM tickets WHERE title LIKE ? OR ticket_number LIKE ?
       ORDER BY created_at DESC LIMIT 30`, [like, like]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error searching tickets' });
  }
});

router.get('/', authRequired, async (req, res) => {
  try {
    let sql = 'SELECT tickets.*, (SELECT COUNT(*) FROM ticket_comments c WHERE c.ticket_id = tickets.id) AS comment_count, (SELECT MAX(c.created_at) FROM ticket_comments c WHERE c.ticket_id = tickets.id) AS last_comment_at FROM tickets';
    const params = [];
    if (req.query.platform) {
      sql += ' WHERE platform = ?';
      params.push(req.query.platform);
    }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await pool.execute(sql, params);
    const atts = await attachmentsFor(rows.map(r => r.id));
    rows.forEach(r => { r.attachments = atts[r.id]; });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error loading tickets' });
  }
});

router.get('/:id', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT tickets.*, (SELECT MAX(c.created_at) FROM ticket_comments c WHERE c.ticket_id = tickets.id) AS last_comment_at FROM tickets WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Ticket not found' });
    rows[0].attachments = (await attachmentsFor([rows[0].id]))[rows[0].id];
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error loading ticket' });
  }
});

router.post('/', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'QA') {
      return res.status(403).json({ error: 'Only QA members can file new tickets' });
    }
    const { title, description, platform, priority, severity, assignee_id } = req.body;
    if (!title || !platform) return res.status(400).json({ error: 'Title and platform are required' });
    if (!ALLOWED_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform specified' });
    }
    const id = uuidv4();
    const shareToken = uuidv4();
    const ticketNumber = await nextNumber(platform);
    await pool.execute(
      `INSERT INTO tickets
        (id, ticket_number, title, description, platform, status, priority, severity, assignee_id, filed_by_id, filed_by_name, share_token)
       VALUES (?, ?, ?, ?, ?, 'On Filing', ?, ?, ?, ?, ?, ?)`,
      [
        id, ticketNumber, title, description || '', platform,
        priority || 'Medium', severity || 'Minor', assignee_id || null,
        req.user.id, req.user.name, shareToken
      ]
    );
    await logActivity(id, req.user, 'created', { platform });
    const [rows] = await pool.execute('SELECT * FROM tickets WHERE id = ?', [id]);
    rows[0].attachments = [];
    res.json(rows[0]);
    } catch (err) {
      console.error('Error filing ticket:', err.message, err.sqlMessage || '');
      res.status(500).json({ error: 'Server error filing ticket' });
    }
});

// Edit ticket fields: QA can edit everything; Devs can edit assignee_id
router.put('/:id', authRequired, async (req, res) => {
  try {
    const [existing] = await pool.execute('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Ticket not found' });
    const t = existing[0];
    const { title, description, priority, severity, assignee_id } = req.body;

    // Work out what actually changed, so it can be written to the activity feed afterwards
    const log = [];
    const newAssignee = assignee_id !== undefined ? (assignee_id || null) : t.assignee_id;
    if (req.user.role === 'QA') {
      if (title !== undefined && title !== t.title) log.push(['updated', { field: 'title', old: t.title, new: title }]);
      if (description !== undefined && description !== t.description) log.push(['updated', { field: 'description' }]);
      if (priority !== undefined && priority !== t.priority) log.push(['updated', { field: 'priority', old: t.priority, new: priority }]);
      if (severity !== undefined && severity !== t.severity) log.push(['updated', { field: 'severity', old: t.severity, new: severity }]);
    }
    if ((newAssignee || null) !== (t.assignee_id || null)) {
      const names = await userNames([t.assignee_id, newAssignee]);
      const from = t.assignee_id ? (names[t.assignee_id] || 'Unknown') : null;
      const to = newAssignee ? (names[newAssignee] || 'Unknown') : null;
      if (from && to) log.push(['reassigned', { from, to }]);
      else if (to) log.push(['assigned', { name: to }]);
      else if (from) log.push(['unassigned', { name: from }]);
    }

    if (req.user.role === 'QA') {
      await pool.execute(
        `UPDATE tickets SET title = ?, description = ?, priority = ?, severity = ?, assignee_id = ? WHERE id = ?`,
        [
          title !== undefined ? title : t.title,
          description !== undefined ? description : t.description,
          priority !== undefined ? priority : t.priority,
          severity !== undefined ? severity : t.severity,
          assignee_id !== undefined ? (assignee_id || null) : t.assignee_id,
          req.params.id
        ]
      );
    } else if (req.user.role === 'Dev') {
      await pool.execute(
        `UPDATE tickets SET assignee_id = ? WHERE id = ?`,
        [assignee_id !== undefined ? (assignee_id || null) : t.assignee_id, req.params.id]
      );
    } else {
      return res.status(403).json({ error: 'Permission denied' });
    }

    for (const [action, details] of log) await logActivity(req.params.id, req.user, action, details);

    const [rows] = await pool.execute('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating ticket' });
  }
});

// Safely update ticket status and timestamps without raw string interpolation
// Moves a ticket to a new status. Only the columns that really change are written.
async function moveTicket(id, status) {
  const [existing] = await pool.execute('SELECT * FROM tickets WHERE id = ?', [id]);
  const t = existing[0];
  if (!t) return null;
  if (!statusesFor(t.platform).includes(status)) return { invalid: true, platform: t.platform };
  const blank = v => !v || /^0000-00-00/.test(String(v));
  const sets = ['status = ?'];
  if (status === 'Complete (For Retest)' && blank(t.fixed_at)) sets.push('fixed_at = NOW()');
  if (status === 'Reactive' && t.status !== 'Reactive') sets.push('reactive_at = NOW()');
  if (status === 'Closed') {
    if (t.status !== 'Closed' || blank(t.closed_at)) sets.push('closed_at = NOW()');
  } else if (t.closed_at) {
    sets.push('closed_at = NULL');
  }
  await pool.execute(`UPDATE tickets SET ${sets.join(', ')} WHERE id = ?`, [status, id]);
  return { from: t.status };
}

// Self-heal: if the database rejects a move because of an invalid "0000-00-00" date on this ticket,
// blank that date and try once more.
const DATE_ERRORS = new Set(['ER_TRUNCATED_WRONG_VALUE', 'ER_WARN_DATA_OUT_OF_RANGE', 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD']);
async function repairDates(id) {
  for (const col of ['fixed_at', 'closed_at']) {
    try {
      await pool.execute(`UPDATE tickets SET ${col} = NULL WHERE id = ? AND ${col} IS NOT NULL AND CAST(${col} AS CHAR) LIKE '0000%'`, [id]);
    } catch (e) { /* keep going */ }
  }
}

router.put('/:id/status', authRequired, async (req, res) => {
  try {
    const { status } = req.body;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    let found;
    try {
      found = await moveTicket(req.params.id, status);
    } catch (err) {
      if (!DATE_ERRORS.has(err.code) && err.errno !== 1292) throw err;
      console.warn('Invalid date on ticket', req.params.id, '- repairing and retrying');
      await repairDates(req.params.id);
      found = await moveTicket(req.params.id, status);
    }
    if (!found) return res.status(404).json({ error: 'Ticket not found' });
    if (found.invalid) return res.status(400).json({ error: `"${status}" is not a column on the ${found.platform} board` });
    if (found.from !== status) await logActivity(req.params.id, req.user, 'moved', { from: found.from, to: status });

    const [rows] = await pool.execute('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error moving ticket', req.params.id, '->', req.body && req.body.status, ':', err.code, err.message);
    res.status(500).json({ error: 'Server error moving ticket', code: err.code || null });
  }
});

router.delete('/:id', authRequired, qaRequired, async (req, res) => {
  try {
    const files = (await attachmentsFor([req.params.id]))[req.params.id] || [];
    const [result] = await pool.execute('DELETE FROM tickets WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Ticket not found' });
    files.forEach(removeFile);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting ticket' });
  }
});

module.exports = router;