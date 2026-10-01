// Generates ticket numbers like AND-0001, IOS-0001, WEB-0001, 77AND-0001, 77IOS-0001.
const pool = require('./pool');

const PREFIX = {
  Android: 'AND',
  iOS: 'IOS',
  Web: 'WEB',
  '77 Live Android': '77AND',
  '77 Live iOS': '77IOS'
};

function format(platform, n) {
  const prefix = PREFIX[platform] || 'TCK';
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

async function nextNumber(platform) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Ensure counter row exists
    await conn.execute('INSERT IGNORE INTO counters (platform, last_number) VALUES (?, 0)', [platform]);

    // Lock the counter row and fetch the current value safely
    const [rows] = await conn.execute('SELECT last_number FROM counters WHERE platform = ? FOR UPDATE', [platform]);
    const nextVal = (rows[0] ? Number(rows[0].last_number) : 0) + 1;

    // Update the counter
    await conn.execute('UPDATE counters SET last_number = ? WHERE platform = ?', [nextVal, platform]);

    await conn.commit();
    return format(platform, nextVal);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Preview only (does not reserve the number)
async function peekNumber(platform) {
  const [rows] = await pool.execute('SELECT last_number FROM counters WHERE platform = ?', [platform]);
  const lastNum = rows[0] ? Number(rows[0].last_number) : 0;
  return format(platform, lastNum + 1);
}

module.exports = { nextNumber, peekNumber, PREFIX };