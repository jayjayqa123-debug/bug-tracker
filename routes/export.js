const express = require('express');
const pool = require('../db/pool');
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
    const [filedToday, fixedToday, stillActive, closedToday, pendingRegression, total] = await Promise.all([
      countWhere(platform, 'DATE(created_at) = CURDATE()'),
      countWhere(platform, 'DATE(fixed_at) = CURDATE()'),
      countWhere(platform, "status != 'Closed'"),
      countWhere(platform, 'DATE(closed_at) = CURDATE()'),
      countWhere(platform, "status = 'Complete (For Retest)'"),
      countWhere(platform, null)
    ]);
    res.json({ filedToday, fixedToday, stillActive, closedToday, pendingRegression, total });
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

    const headers = ['Ticket No', 'Title', 'Platform', 'Status', 'Priority', 'Severity', 'Filed By', 'Assignee ID', 'Created At', 'Fixed At', 'Closed At'];
    const escape = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = tickets.map(t => [
      t.ticket_number || '', escape(t.title), t.platform, t.status, t.priority, t.severity,
      t.filed_by_name || '', t.assignee_id || '', t.created_at, t.fixed_at || '', t.closed_at || ''
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
