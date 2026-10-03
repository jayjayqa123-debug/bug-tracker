// QA Admin tools. Every route requires a QA account listed in ADMIN_EMAILS.
// Passwords are stored as one-way bcrypt hashes and can never be displayed;
// the admin instead issues a temporary password that the user must replace.
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db/pool');
const { adminRequired } = require('../middleware/auth');

const router = express.Router();
router.use(adminRequired);

// No look-alike characters (0/O, 1/l/I) so it is easy to read out or type
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function tempPassword(len = 10) {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

function adminEmails() {
  return (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, email, role, platform, created_at, reset_requested_at, must_change_password,
              (password IS NOT NULL) AS has_password, (google_id IS NOT NULL) AS has_google,
              (SELECT COUNT(*) FROM tickets t WHERE t.filed_by_id = users.id) AS filed_count,
              (SELECT COUNT(*) FROM tickets t WHERE t.assignee_id = users.id) AS assigned_count,
              (last_seen_at IS NOT NULL AND last_seen_at >= NOW() - INTERVAL 2 MINUTE) AS is_online,
              TIMESTAMPDIFF(SECOND, last_seen_at, NOW()) AS seen_ago_s
       FROM users
       ORDER BY (reset_requested_at IS NULL), reset_requested_at DESC, role, name`
    );
    const admins = adminEmails();
    res.json(rows.map(r => ({
      ...r,
      filed_count: Number(r.filed_count) || 0,
      assigned_count: Number(r.assigned_count) || 0,
      is_admin: admins.includes(String(r.email).toLowerCase()),
      is_me: r.id === req.user.id,
      is_online: !!Number(r.is_online),
      seen_ago_s: r.seen_ago_s === null ? null : Number(r.seen_ago_s),
      has_password: !!r.has_password,
      has_google: !!r.has_google,
      must_change_password: !!r.must_change_password
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error loading users' });
  }
});

router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, name, password FROM users WHERE id = ?', [req.params.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.password) return res.status(400).json({ error: 'This account signs in with Google and has no password' });
    const temp = tempPassword();
    const hash = await bcrypt.hash(temp, 10);
    await pool.execute(
      'UPDATE users SET password = ?, must_change_password = 1, reset_requested_at = NULL WHERE id = ?',
      [hash, user.id]
    );
    res.json({ name: user.name, temporaryPassword: temp });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error resetting password' });
  }
});

// Delete a user account. Tickets are NEVER deleted: an account that has filed tickets cannot be
// removed (the database would erase those tickets with it). Tickets merely assigned to the user
// stay and become "Unassigned".
router.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
    const [rows] = await pool.execute('SELECT id, name, email FROM users WHERE id = ?', [req.params.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (adminEmails().includes(String(user.email).toLowerCase())) {
      return res.status(400).json({ error: 'QA Admin accounts cannot be deleted here.' });
    }
    const [[{ filed }]] = await pool.execute('SELECT COUNT(*) AS filed FROM tickets WHERE filed_by_id = ?', [user.id]);
    if (filed > 0) {
      return res.status(409).json({ error: `${user.name} has filed ${filed} ticket(s). To keep that data, this account cannot be deleted.` });
    }
    const [[{ assigned }]] = await pool.execute('SELECT COUNT(*) AS assigned FROM tickets WHERE assignee_id = ?', [user.id]);
    await pool.execute('UPDATE tickets SET assignee_id = NULL WHERE assignee_id = ?', [user.id]);
    await pool.execute('DELETE FROM users WHERE id = ?', [user.id]);
    res.json({ message: 'Deleted', name: user.name, unassignedTickets: Number(assigned) || 0 });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ error: 'Server error deleting user' });
  }
});

// Combined stats for Android + iOS + Web (read-only). Same definitions as the board's stats bar.
router.get('/stats', async (req, res) => {
  try {
    const [[r]] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(DATE(created_at) = CURDATE()) AS filedToday,
        SUM(DATE(fixed_at) = CURDATE()) AS fixedToday,
        SUM(status NOT IN ('Closed', 'Complete (For Retest)', 'Fixed', 'Resolved', 'WONTFIX', 'Duplicate')) AS stillActive,
        SUM(status IN ('Reactive', 'Re-active', 'Reopened', 'Re-opened')) AS reactive,
        SUM(DATE(closed_at) = CURDATE()) AS closedToday,
        SUM(status = 'Complete (For Retest)') AS pendingRegression,
        SUM(status = 'Closed') AS totalClosed
      FROM tickets
      WHERE platform IN ('Android', 'iOS', 'Web')`);
    const [closedRows] = await pool.query("SELECT platform, COUNT(*) AS c FROM tickets WHERE status = 'Closed' GROUP BY platform");
    const closedByPlatform = {};
    ['Android', 'iOS', 'Web', '77 Live Android', '77 Live iOS'].forEach(p => { closedByPlatform[p] = 0; });
    closedRows.forEach(r => { closedByPlatform[r.platform] = Number(r.c) || 0; });
    const n = v => Number(v) || 0;
    res.json({
      filedToday: n(r.filedToday), fixedToday: n(r.fixedToday), stillActive: n(r.stillActive),
      reactive: n(r.reactive), closedToday: n(r.closedToday), pendingRegression: n(r.pendingRegression),
      totalClosed: n(r.totalClosed), closedByPlatform,
      total: n(r.total)
    });
  } catch (err) {
    console.error('Admin stats error:', err.message);
    res.status(500).json({ error: 'Could not load stats' });
  }
});

// Read-only backup of every filed ticket (plus comments, attachment records, counters and the user
// list WITHOUT passwords). Sent to the admin's browser as a download - nothing is stored on the server
// and nothing is changed or deleted.
router.get('/backup', async (req, res) => {
  try {
    const [tickets] = await pool.query('SELECT * FROM tickets ORDER BY created_at');
    const [comments] = await pool.query('SELECT * FROM ticket_comments ORDER BY created_at');
    const [attachments] = await pool.query('SELECT * FROM attachments ORDER BY created_at');
    const [counters] = await pool.query('SELECT * FROM counters');
    const [users] = await pool.query('SELECT id, name, email, role, platform, created_at FROM users');

    const d = new Date(), p = n => String(n).padStart(2, '0');
    const name = `bug-tracker-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(JSON.stringify({
      backed_up_at: d.toISOString(),
      backed_up_by: req.user.email,
      counts: { tickets: tickets.length, comments: comments.length, attachments: attachments.length },
      tickets, comments, attachments, counters, users
    }, null, 2));
  } catch (err) {
    console.error('Backup error:', err.message);
    res.status(500).json({ error: 'Could not create the backup' });
  }
});

module.exports = router;
