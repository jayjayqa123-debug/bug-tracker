const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'change_this_secret';

function authRequired(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded; // { id, name, email, role }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Admin = a QA account whose email is listed in the ADMIN_EMAILS env variable
// (comma separated). Checked on every request, so removing an email takes effect immediately.
function isAdminUser(u) {
  if (!u || u.role !== 'QA' || !u.email) return false;
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(String(u.email).toLowerCase());
}

function qaRequired(req, res, next) {
  if (!req.user || req.user.role !== 'QA') {
    return res.status(403).json({ error: 'Only QA members can do this. Developers can update the status and leave comments.' });
  }
  next();
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (!isAdminUser(req.user)) return res.status(403).json({ error: 'QA Admin access only' });
    next();
  });
}

module.exports = { authRequired, qaRequired, adminRequired, isAdminUser, SECRET };
