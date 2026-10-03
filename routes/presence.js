// Lightweight presence: the browser pings every 30s while a page is open.
const express = require('express');
const { authRequired, touchUser, markOffline } = require('../middleware/auth');
const router = express.Router();

router.post('/ping', authRequired, (req, res) => {
  touchUser(req.user.id, true);
  res.json({ ok: true });
});

router.post('/offline', authRequired, async (req, res) => {
  try { await markOffline(req.user.id); } catch (e) { /* ignore */ }
  res.json({ ok: true });
});

module.exports = router;
