// Loads a backup into an EMPTY database so you can rehearse things (like the Trello sync) safely.
//
//   node restore-backup.js <backup file or snapshot folder>            shows what it would do
//   node restore-backup.js <backup file or snapshot folder> --confirm  does it
//
// Accepts either
//   - the .json file downloaded with the admin "Backup" button, or
//   - a snapshot folder made by `npm run backup` (e.g. backups\2026-10-03_0930)
//
// Safety: it never deletes anything, and it refuses to run if the target database already has tickets
// that are not part of the backup, so it can never overwrite real data. It is safe to re-run after a
// failed or interrupted restore (rows that are already there are skipped). Point .env at a test database first (DB_NAME).
// Restored users get no password (use Register to create a new login in the test database).

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db/pool');

const src = process.argv[2];
const CONFIRM = process.argv.includes('--confirm');

function load(src) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    const rd = f => JSON.parse(fs.readFileSync(path.join(src, f), 'utf8'));
    return { users: rd('users.json'), tickets: rd('tickets.json'), comments: rd('comments.json'),
      attachments: rd('attachments.json'), counters: rd('counters.json') };
  }
  const d = JSON.parse(fs.readFileSync(src, 'utf8'));
  return { users: d.users || [], tickets: d.tickets || [], comments: d.comments || [],
    attachments: d.attachments || [], counters: d.counters || [] };
}

const stats = {};
const failures = [];
const colCache = {};

async function tableColumns(table) {
  if (!colCache[table]) {
    const [r] = await pool.query(
      'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]);
    colCache[table] = new Set(r.map(x => x.COLUMN_NAME));
  }
  return colCache[table];
}

// Inserts every row it can. Rows that are already there are skipped; any row the database
// rejects is recorded (with the reason) instead of stopping the whole restore.
async function insertRows(table, rows, upsertKey) {
  const st = stats[table] = stats[table] || { ok: 0, skipped: 0, failed: 0 };
  const known = await tableColumns(table);
  for (const r of rows) {
    const cols = Object.keys(r).filter(c => known.has(c));
    const sql = `INSERT INTO ${table} (${cols.map(c => '`' + c + '`').join(',')}) VALUES (${cols.map(() => '?').join(',')})` +
      (upsertKey ? ` ON DUPLICATE KEY UPDATE \`${upsertKey}\` = VALUES(\`${upsertKey}\`)` : '');
    try {
      await pool.execute(sql, cols.map(c => r[c] === undefined ? null : r[c]));
      st.ok++;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY' && /PRIMARY/i.test(e.message)) st.skipped++;
      else { st.failed++; failures.push(`${table} ${r.ticket_number || r.email || r.id || ''}: ${e.message}`); }
    }
  }
  return st.ok;
}

// The migration seeds a few starter users. If one has the same email as a backed-up user but a
// different id, give it the backup's id so the restored tickets point at the right person.
async function restoreUsers(users) {
  let n = 0;
  for (const u of users) {
    const [byId] = await pool.execute('SELECT id FROM users WHERE id = ?', [u.id]);
    if (byId.length) continue;
    const [byEmail] = await pool.execute('SELECT id FROM users WHERE email = ?', [u.email]);
    if (byEmail.length) {
      await pool.execute('UPDATE users SET id = ?, name = ?, role = ?, platform = ?, created_at = ? WHERE email = ?',
        [u.id, u.name, u.role, u.platform ?? null, u.created_at, u.email]);
    } else {
      await insertRows('users', [u]);
    }
    n++;
  }
  return n;
}

async function main() {
  if (!src || !fs.existsSync(src)) {
    console.log('Usage: node restore-backup.js <backup .json file or snapshot folder> [--confirm]');
    return;
  }
  const data = load(src);
  const [[db]] = await pool.query('SELECT DATABASE() AS name');
  const [existing] = await pool.query('SELECT id FROM tickets');
  const backupIds = new Set(data.tickets.map(t => t.id));
  const foreign = existing.filter(r => !backupIds.has(r.id)).length;

  console.log(`Target database : ${process.env.DB_HOST} / ${db.name}`);
  console.log(`Backup contains : ${data.tickets.length} tickets, ${data.comments.length} comments, ${data.attachments.length} attachments, ${data.users.length} users`);

  if (foreign > 0) {
    console.log(`\nStopped: this database already has ${foreign} ticket(s) that are not in the backup.`);
    console.log('Restore is only for an empty test database, so real data can never be touched. Check DB_NAME in your .env.');
    return;
  }
  if (existing.length) console.log(`(Resuming: ${existing.length} ticket(s) from this backup are already restored and will be skipped.)`);
  if (!CONFIRM) {
    console.log('\nNothing was changed. If the target above is your TEST database, add --confirm to restore.');
    return;
  }

  if (data.tickets.some(t => 'trello_card_id' in t) && !(await tableColumns('tickets')).has('trello_card_id')) {
    await pool.query('ALTER TABLE tickets ADD COLUMN trello_card_id VARCHAR(40) NULL');
    // TiDB cannot add a column and an index on it in one statement, so the index is a second step
    try { await pool.query('ALTER TABLE tickets ADD INDEX idx_trello_card (trello_card_id)'); } catch (e) { /* index is optional */ }
    delete colCache.tickets;
    console.log('Added tickets.trello_card_id column to the test database (the backup has it).');
  }

  const u = await restoreUsers(data.users);
  await insertRows('tickets', data.tickets);
  await insertRows('ticket_comments', data.comments);
  await insertRows('attachments', data.attachments);
  await insertRows('counters', data.counters, 'last_number');

  console.log('\nResult (restored / already there / failed):');
  for (const [t, st] of Object.entries(stats)) console.log(`  ${t.padEnd(12)} ${st.ok} / ${st.skipped} / ${st.failed}`);
  if (failures.length) {
    console.log(`\n${failures.length} row(s) were rejected by the database. First few:`);
    failures.slice(0, 8).forEach(f => console.log('  - ' + f.slice(0, 200)));
    process.exitCode = 1;
  } else {
    console.log('\nAll rows restored.');
  }
}

main()
  .then(() => pool.end())
  .catch(err => { console.error('Restore failed:', err.message); pool.end().finally(() => process.exit(1)); });
