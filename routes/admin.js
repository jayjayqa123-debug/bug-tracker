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

router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, email, role, platform, created_at, reset_requested_at, must_change_password,
              (password IS NOT NULL) AS has_password, (google_id IS NOT NULL) AS has_google
       FROM users
       ORDER BY (reset_requested_at IS NULL), reset_requested_at DESC, role, name`
    );
    res.json(rows.map(r => ({
      ...r,
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
