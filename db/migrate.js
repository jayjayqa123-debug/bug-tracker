// Creates missing tables and upgrades older databases in place.
// Runs automatically every time the server starts; safe to run repeatedly.
// Manual run:  npm run migrate
const fs = require('fs');
const path = require('path');
const pool = require('./pool');
const { nextNumber, PREFIX } = require('./ticketNumber');

async function columnInfo(table, column) {
  const [rows] = await pool.execute(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0] || null;
}

async function migrate() {
  // 1) Create any missing tables from schema.sql
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  for (const stmt of sql.split(';').map(s => s.trim()).filter(Boolean)) {
    await pool.query(stmt);
  }

  // 2) Upgrade tables that were created by an older version of the app
  if (!(await columnInfo('users', 'platform'))) {
    await pool.query("ALTER TABLE users ADD COLUMN platform ENUM('Android','iOS','Web') NULL AFTER role");
  }
  if (!(await columnInfo('users', 'google_id'))) {
    await pool.query('ALTER TABLE users ADD COLUMN google_id VARCHAR(64) NULL UNIQUE AFTER password');
  }
  const pw = await columnInfo('users', 'password');
  if (pw && pw.IS_NULLABLE === 'NO') {
    await pool.query('ALTER TABLE users MODIFY password VARCHAR(255) NULL');
  }
  if (!(await columnInfo('tickets', 'ticket_number'))) {
    await pool.query('ALTER TABLE tickets ADD COLUMN ticket_number VARCHAR(20) NULL UNIQUE AFTER id');
  }

  // 3) Make sure every platform has a counter, then number any old tickets
  for (const p of Object.keys(PREFIX)) {
    await pool.execute('INSERT IGNORE INTO counters (platform, last_number) VALUES (?, 0)', [p]);
    const [old] = await pool.execute(
      'SELECT id FROM tickets WHERE platform = ? AND ticket_number IS NULL ORDER BY created_at, id', [p]
    );
    for (const t of old) {
      const no = await nextNumber(p);
      await pool.execute('UPDATE tickets SET ticket_number = ? WHERE id = ?', [no, t.id]);
    }
  }
}

module.exports = { migrate };

if (require.main === module) {
  require('dotenv').config();
  migrate()
    .then(() => { console.log('Database is up to date.'); process.exit(0); })
    .catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
}
