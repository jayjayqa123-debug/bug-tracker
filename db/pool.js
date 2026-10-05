// MySQL connection pool, configured from environment variables.
// On cPanel, these match the database you create in "MySQL Databases".
// MySQL connection pool, configured from environment variables.
// On CI, please match the database you create in "MySQL Databases".

require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  ssl: {
    rejectUnauthorized: true
  },

  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,

  // Cloud databases close idle connections; keep them alive and drop stale ones quickly
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  maxIdle: 4,
  idleTimeout: 60000,
  connectTimeout: 20000
});

// Always talk to the database in UTC, so stored times never depend on the server's own time zone
// (Render, TiDB and your PC may all differ). The pages convert UTC to Philippine time for display.
pool.pool.on('connection', conn => conn.query("SET time_zone = '+00:00'"));

// If a stale connection was reset by the network/database (ECONNRESET), retry read queries once
const RETRY_CODES = new Set(['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'EPIPE', 'ETIMEDOUT']);
for (const method of ['query', 'execute']) {
  const original = pool[method].bind(pool);
  pool[method] = async (sql, params) => {
    try {
      return await original(sql, params);
    } catch (err) {
      const text = typeof sql === 'string' ? sql : (sql && sql.sql) || '';
      if (RETRY_CODES.has(err.code) && /^\s*(select|show)\b/i.test(text)) {
        return original(sql, params);
      }
      throw err;
    }
  };
}

module.exports = pool;