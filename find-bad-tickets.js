// Lists tickets whose date columns hold an invalid value (e.g. 0000-00-00). Read-only.   node find-bad-tickets.js
require('dotenv').config();
const pool = require('./db/pool');
(async () => {
  const cols = ['fixed_at', 'closed_at', 'created_at', 'updated_at'];
  const where = cols.map(c => `CAST(${c} AS CHAR) LIKE '0000%'`).join(' OR ');
  const [rows] = await pool.query(
    `SELECT ticket_number, platform, status, ${cols.map(c => `CAST(${c} AS CHAR) AS ${c}`).join(', ')} FROM tickets WHERE ${where} ORDER BY platform, ticket_number`);
  if (!rows.length) console.log('No tickets with invalid dates were found.');
  else { console.log(`${rows.length} ticket(s) with an invalid date:`); console.table(rows); }
  await pool.end();
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
