// Shows how your database handles time. Run:  node check-time.js
require('dotenv').config();
const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, ssl: { rejectUnauthorized: true }, dateStrings: true
  });
  const [[a]] = await c.query('SELECT @@global.time_zone AS global_tz, @@session.time_zone AS session_tz, @@system_time_zone AS system_tz, NOW() AS db_now, UTC_TIMESTAMP() AS utc_now');
  console.log('Database default time zone :', a.global_tz, '| system:', a.system_tz);
  console.log('Database NOW()             :', a.db_now);
  console.log('Real UTC time              :', a.utc_now);
  console.log('Your PC time               :', new Date().toString());
  const [[t]] = await c.query('SELECT ticket_number, created_at FROM tickets ORDER BY created_at DESC LIMIT 1');
  if (t) console.log('Newest ticket              :', t.ticket_number, 'created_at =', t.created_at, '(as stored)');
  await c.end();
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
