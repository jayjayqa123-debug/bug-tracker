// Generates ticket numbers like AND-0001, IOS-0001, WEB-0001.
// Each platform has its own counter row, updated atomically so two QA members
// filing at the same moment can never get the same number.
const pool = require('./pool');

const PREFIX = { Android: 'AND', iOS: 'IOS', Web: 'WEB' };

function format(platform, n) {
  return `${PREFIX[platform]}-${String(n).padStart(4, '0')}`;
}

async function nextNumber(platform) {
  const conn = await pool.getConnection(); // LAST_INSERT_ID() is per-connection
  try {
    await conn.execute('INSERT IGNORE INTO counters (platform, last_number) VALUES (?, 0)', [platform]);
    await conn.execute('UPDATE counters SET last_number = LAST_INSERT_ID(last_number + 1) WHERE platform = ?', [platform]);
    const [[row]] = await conn.query('SELECT LAST_INSERT_ID() AS n');
    return format(platform, Number(row.n));
  } finally {
    conn.release();
  }
}

// Preview only (does not reserve the number)
async function peekNumber(platform) {
  const [rows] = await pool.execute('SELECT last_number FROM counters WHERE platform = ?', [platform]);
  return format(platform, (rows[0] ? Number(rows[0].last_number) : 0) + 1);
}

module.exports = { nextNumber, peekNumber, PREFIX };
