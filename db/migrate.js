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
  // Statements for objects that already exist (table, key, row...) are skipped,
  // so this is safe to run on every start. ER_WRONG_AUTO_KEY / ER_NO_SUCH_TABLE cover the
  // legacy `bugs`/`projects` tables in the dump, which the app does not use and which
  // can't be created from the dump as written (AUTO_INCREMENT column before its key).
  const SKIP = ['ER_TABLE_EXISTS_ERROR', 'ER_DUP_ENTRY', 'ER_DUP_KEYNAME', 'ER_MULTIPLE_PRI_KEY',
    'ER_FK_DUP_NAME', 'ER_DUP_FIELDNAME', 'ER_WRONG_AUTO_KEY', 'ER_NO_SUCH_TABLE', 'ER_CANT_CREATE_TABLE'];
  for (const stmt of sql.split(';').map(s => s.trim()).filter(Boolean)) {
    try {
      await pool.query(stmt);
    } catch (e) {
      if (!SKIP.includes(e.code)) throw e;
    }
  }

  // 2) Upgrade tables that were created by an older version of the app
  if (!(await columnInfo('users', 'platform'))) {
    await pool.query("ALTER TABLE users ADD COLUMN platform ENUM('Android','iOS','Web','77 Live Android','77 Live iOS') NULL AFTER role");
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

  // Password reset support + ticket comments
  if (!(await columnInfo('users', 'must_change_password'))) {
    await pool.query('ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0');
  }
  if (!(await columnInfo('users', 'last_seen_at'))) {
    await pool.query('ALTER TABLE users ADD COLUMN last_seen_at DATETIME NULL');
  }
  if (!(await columnInfo('users', 'reset_requested_at'))) {
    await pool.query('ALTER TABLE users ADD COLUMN reset_requested_at DATETIME NULL');
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS ticket_comments (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    ticket_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    user_role VARCHAR(10) NOT NULL,
    body TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_comment_ticket (ticket_id, created_at),
    CONSTRAINT fk_comment_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);

  // Widen platform columns on older databases so the 77 Live platforms are accepted
  const PLATFORM_ENUM = "ENUM('Android','iOS','Web','77 Live Android','77 Live iOS')";
  for (const [table, nullable] of [['users', 'NULL'], ['tickets', 'NOT NULL']]) {
    const [[col]] = await pool.execute(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'platform'`, [table]);
    if (col && !String(col.COLUMN_TYPE).includes('77 Live')) {
      await pool.query(`ALTER TABLE ${table} MODIFY platform ${PLATFORM_ENUM} ${nullable}`);
    }
  }

  // counters.platform is the PRIMARY KEY, and some MySQL-compatible databases (e.g. TiDB)
  // refuse to MODIFY a primary-key column. So rebuild this small table instead.
  const [[cc]] = await pool.execute(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'counters' AND COLUMN_NAME = 'platform'`);
  if (cc && !String(cc.COLUMN_TYPE).includes('77 Live')) {
    await pool.query(`CREATE TABLE counters_new (
      platform ${PLATFORM_ENUM} NOT NULL,
      last_number INT NOT NULL DEFAULT 0,
      PRIMARY KEY (platform)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);
    await pool.query('INSERT INTO counters_new (platform, last_number) SELECT platform, last_number FROM counters');
    // Keep the old table as a safety copy instead of dropping it
    await pool.query('RENAME TABLE counters TO counters_old_backup, counters_new TO counters');
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
