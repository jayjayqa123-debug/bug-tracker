// Comments on a ticket - the QA <-> Dev conversation.
// Mounted at /api/tickets/:id/comments  (see routes/tickets.js)
// Both QA and Dev may read and post; only the author can delete their own comment.
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authRequired } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
const MAX_LEN = 2000;

async function ticketExists(id) {
  const [rows] = await pool.execute('SELECT id FROM tickets WHERE id = ?', [id]);
  return !!rows[0];
}

router.get('/', authRequired, async (req, res) => {
  try {
    if (!(await ticketExists(req.params.id))) return res.status(404).json({ error: 'Ticket not found' });
    const [rows] = await pool.execute(
      'SELECT id, user_id, user_name, user_role, body, created_at FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at, id',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error loading comments' });
  }
});

router.post('/', authRequired, async (req, res) => {
  try {
    if (!(await ticketExists(req.params.id))) return res.status(404).json({ error: 'Ticket not found' });
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Comment cannot be empty' });
    if (body.length > MAX_LEN) return res.status(400).json({ error: `Comment is too long (max ${MAX_LEN} characters)` });
    const id = uuidv4();
    await pool.execute(
      'INSERT INTO ticket_comments (id, ticket_id, user_id, user_name, user_role, body) VALUES (?, ?, ?, ?, ?, ?)',
      [id, req.params.id, req.user.id, req.user.name, req.user.role, body]
    );
    const [rows] = await pool.execute(
      'SELECT id, user_id, user_name, user_role, body, created_at FROM ticket_comments WHERE id = ?', [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error posting comment' });
  }
});

router.delete('/:commentId', authRequired, async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM ticket_comments WHERE id = ? AND ticket_id = ? AND user_id = ?',
      [req.params.commentId, req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Comment not found, or it is not yours to delete' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting comment' });
  }
});

module.exports = router;
