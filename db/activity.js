// Activity log ("who did what to a ticket"), like the activity feed on a Trello card.
const { v4: uuidv4 } = require('uuid');
const pool = require('./pool');

const DDL = `CREATE TABLE IF NOT EXISTS ticket_activity (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  ticket_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NULL,
  user_name VARCHAR(255) NOT NULL,
  user_role VARCHAR(10) NULL,
  action VARCHAR(40) NOT NULL,
  details TEXT NULL,
  source VARCHAR(10) NOT NULL DEFAULT 'app',
  external_id VARCHAR(40) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_activity_ticket (ticket_id, created_at),
  UNIQUE KEY uq_activity_external (external_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`;

async function ensureActivityTable() {
  await pool.query(DDL);
}

// Never lets a logging problem break the real action.
async function logActivity(ticketId, user, action, details) {
  try {
    await pool.execute(
      `INSERT INTO ticket_activity (id, ticket_id, user_id, user_name, user_role, action, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), ticketId, (user && user.id) || null, (user && user.name) || 'System',
       (user && user.role) || null, action, details ? JSON.stringify(details) : null]);
  } catch (e) {
    console.error('Could not record activity:', e.message);
  }
}

// id -> name for a few users (used to write "assigned Kulas Santos")
async function userNames(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return {};
  const [rows] = await pool.query('SELECT id, name FROM users WHERE id IN (?)', [list]);
  return Object.fromEntries(rows.map(r => [r.id, r.name]));
}

module.exports = { ensureActivityTable, logActivity, userNames, DDL };
