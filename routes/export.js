const express = require('express');
const pool = require('../db/pool');
const { toPh } = require('../services/phtime');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// Daily bug-report style stats (filed today, fixed today, still active, closed today, pending regression)
async function countWhere(platform, extraCondition, extraParams = []) {
  const conditions = [];
  const params = [];
  if (platform) { conditions.push('platform = ?'); params.push(platform); }
  if (extraCondition) { conditions.push(extraCondition); params.push(...extraParams); }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [[{ c }]] = await pool.execute(`SELECT COUNT(*) AS c FROM tickets ${whereClause}`, params);
  return c;
}

router.get('/stats', authRequired, async (req, res) => {
  try {
    const platform = req.query.platform || null;

    // One grouped query (instead of 15 separate ones = 15 round trips to the database)
    const [rows] = await pool.query(`
      SELECT platform,
        COUNT(*) AS total,
        SUM(DATE(created_at + INTERVAL 8 HOUR) = DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR)) AS filedToday,
        SUM(DATE(fixed_at + INTERVAL 8 HOUR) = DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR)) AS fixedToday,
        SUM(DATE(fixed_at + INTERVAL 8 HOUR) = DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR) - INTERVAL 1 DAY) AS fixedYesterday,
        SUM(status IN ('Fixed', 'Resolved') OR fixed_at IS NOT NULL) AS totalFixed,
        SUM(status NOT IN ('Closed', 'Complete (For Retest)', 'Fixed', 'Resolved', 'WONTFIX', 'Duplicate')) AS stillActive,
        SUM(status IN ('Reactive', 'Re-active', 'Reopened', 'Re-opened')) AS reactive,
        SUM(DATE(closed_at + INTERVAL 8 HOUR) = DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR)) AS closedToday,
        SUM(status = 'Complete (For Retest)') AS pendingRegression,
        SUM(status = 'Closed') AS totalClosed
      FROM tickets
      GROUP BY platform`);

    const num = v => Number(v) || 0;
    const sum = (list, key) => list.reduce((a, r) => a + num(r[key]), 0);
    const selected = platform ? rows.filter(r => r.platform === platform) : rows;
    const countOf = p => num((rows.find(r => r.platform === p) || {}).total);

    res.json({
      filedToday: sum(selected, 'filedToday'),
      fixedToday: sum(selected, 'fixedToday'),
      fixedYesterday: sum(selected, 'fixedYesterday'),
      totalFixed: sum(selected, 'totalFixed'),
      stillActive: sum(selected, 'stillActive'),
      reactive: sum(selected, 'reactive'),
      closedToday: sum(selected, 'closedToday'),
      pendingRegression: sum(selected, 'pendingRegression'),
      totalClosed: sum(selected, 'totalClosed'),
      androidCount: countOf('Android'),
      iosCount: countOf('iOS'),
      live77Count: countOf('77 Live Android'),
      ios77Count: countOf('77 Live iOS'),
      total: sum(selected, 'total'),
      totalOverall: sum(rows, 'total')
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error loading stats' });
  }
});

// CSV export of the full bug list for the selected platform
router.get('/csv', authRequired, async (req, res) => {
  try {
    let sql = 'SELECT * FROM tickets';
    const params = [];
    if (req.query.platform) { sql += ' WHERE platform = ?'; params.push(req.query.platform); }
    sql += ' ORDER BY created_at DESC';
    const [tickets] = await pool.execute(sql, params);

    const headers = ['Ticket No', 'Title', 'Platform', 'Status', 'Priority', 'Severity', 'Filed By', 'Assignee ID', 'Created At (PH time)', 'Last Updated (PH time)', 'Fixed At (PH time)', 'Closed At (PH time)'];
    const escape = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = tickets.map(t => [
      t.ticket_number || '', escape(t.title), t.platform, t.status, t.priority, t.severity,
      t.filed_by_name || '', t.assignee_id || '', toPh(t.created_at), toPh(t.updated_at), toPh(t.fixed_at), toPh(t.closed_at)
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="bug_report_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error exporting CSV' });
  }
});

module.exports = router;