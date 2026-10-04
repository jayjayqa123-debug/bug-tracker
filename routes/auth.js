const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const google = require('../services/google');
const { SECRET, authRequired, isAdminUser, touchUser } = require('../middleware/auth');

const router = express.Router();

const PLATFORMS = ['Android', 'iOS', 'Web', '77 Live Android', '77 Live iOS'];

// Validates role/platform. Returns { error } or { role, platform }.
function checkProfile(role, platform) {
  if (!['QA', 'Dev'].includes(role)) return { error: 'Role must be QA or Dev' };
  if (role === 'Dev') {
    if (!PLATFORMS.includes(platform)) {
      return { error: 'Developers must select a platform: Android, iOS, Web, 77 Live Android, or 77 Live iOS' };
    }
    return { role, platform };
  }
  return { role, platform: null };
}

function session(user) {
  touchUser(user.id, true);   // a sign-in counts as being seen
  const base = { id: user.id, name: user.name, email: user.email, role: user.role, platform: user.platform };
  const token = jwt.sign(base, SECRET, { expiresIn: '7d' });
  return {
    token,
    user: { ...base, isAdmin: isAdminUser(user), mustChangePassword: !!user.must_change_password }
  };
}

const MIN_PASSWORD = 6;

// Tells the login page whether to show the Google button
router.get('/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, platform } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password and role are all required' });
    }
    const profile = checkProfile(role, platform);
    if (profile.error) return res.status(400).json({ error: profile.error });

    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'That email is already registered' });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.execute(
      'INSERT INTO users (id, name, email, password, role, platform) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), name, email, hash, profile.role, profile.platform]
    );
    res.json({ message: 'Registered successfully. You can now log in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error while registering' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });
    if (!user.password) {
      return res.status(400).json({ error: 'This account uses Google sign-in. Click "Continue with Google".' });
    }
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Invalid email or password' });
    res.json(session(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error while logging in' });
  }
});

// Forgot password: there is no email service, so this flags the account and the
// QA Admin sees the request on the Admin page and hands out a temporary password.
// The reply is identical whether or not the email exists (no account enumeration).
router.post('/forgot', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    if (!email) return res.status(400).json({ error: 'Please enter your email' });
    await pool.execute('UPDATE users SET reset_requested_at = NOW() WHERE email = ? AND password IS NOT NULL', [email]);
    res.json({ message: 'Request sent. If that email is registered, the QA Admin will give you a temporary password.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error while sending the request' });
  }
});

// Change your own password (also used to replace an admin-issued temporary one)
router.post('/change-password', authRequired, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' });
    if (String(newPassword).length < MIN_PASSWORD) {
      return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD} characters` });
    }
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const user = rows[0];
    if (!user || !user.password) return res.status(400).json({ error: 'This account has no password to change' });
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.execute(
      'UPDATE users SET password = ?, must_change_password = 0, reset_requested_at = NULL WHERE id = ?',
      [hash, user.id]
    );
    user.must_change_password = 0;
    res.json(session(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error while changing password' });
  }
});

// Fresh copy of the logged-in user (role, admin flag, must-change flag)
router.get('/me', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0]) return res.status(401).json({ error: 'Account no longer exists' });
    res.json(session(rows[0]).user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Step 1 of Google sign-in/sign-up. Existing account -> logged in.
// New Google user -> asked to pick QA/Dev (and platform) in step 2.
router.post('/google', async (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(400).json({ error: 'Google sign-in is not configured on this server' });
    }
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing Google credential' });

    let info;
    try {
      info = await google.verify(credential);
    } catch (e) {
      return res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
    }
    if (!info.emailVerified) {
      return res.status(401).json({ error: 'Your Google email is not verified' });
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE google_id = ? OR email = ?', [info.googleId, info.email]);
    const user = rows[0];
    if (user) {
      if (!user.google_id) {
        // Existing manual account with the same (Google-verified) email: link it
        await pool.execute('UPDATE users SET google_id = ? WHERE id = ?', [info.googleId, user.id]);
      }
      return res.json(session(user));
    }

    const signupToken = jwt.sign(
      { purpose: 'google-signup', googleId: info.googleId, email: info.email, name: info.name },
      SECRET,
      { expiresIn: '15m' }
    );
    res.json({ needsProfile: true, signupToken, name: info.name, email: info.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during Google sign-in' });
  }
});

// Step 2: brand-new Google user chooses QA/Dev (+ platform), account is created.
router.post('/google/complete', async (req, res) => {
  try {
    const { signupToken, role, platform } = req.body;
    let data;
    try {
      data = jwt.verify(signupToken || '', SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Sign-up expired. Please click "Continue with Google" again.' });
    }
    if (data.purpose !== 'google-signup') return res.status(401).json({ error: 'Invalid sign-up token' });

    const profile = checkProfile(role, platform);
    if (profile.error) return res.status(400).json({ error: profile.error });

    const [existing] = await pool.execute('SELECT id FROM users WHERE google_id = ? OR email = ?', [data.googleId, data.email]);
    if (existing.length > 0) return res.status(400).json({ error: 'This account already exists. Please sign in.' });

    const id = uuidv4();
    await pool.execute(
      'INSERT INTO users (id, name, email, password, google_id, role, platform) VALUES (?, ?, ?, NULL, ?, ?, ?)',
      [id, data.name, data.email, data.googleId, profile.role, profile.platform]
    );
    res.json(session({ id, name: data.name, email: data.email, role: profile.role, platform: profile.platform }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error while creating account' });
  }
});

module.exports = router;
