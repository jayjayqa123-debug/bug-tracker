require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const exportRoutes = require('./routes/export');
const adminRoutes = require('./routes/admin');
const { migrate } = require('./db/migrate');

const app = express();
const isVercel = !!process.env.VERCEL;

// Vercel's filesystem is read-only except /tmp (and /tmp is wiped often)
const uploadsDir = isVercel
  ? '/tmp/uploads'
  : path.join(__dirname, 'uploads');
try {
  fs.mkdirSync(uploadsDir, { recursive: true });
} catch (err) {
  console.warn('Could not create uploads folder:', err.message);
}

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/presence', require('./routes/presence'));

app.get('/', (req, res) => res.redirect('/index.html'));

const PORT = process.env.PORT || 3000;

if (!isVercel) {
  // Local / normal server: same behavior as before
  migrate()
    .then(() => {
      console.log('Database migration completed');
      app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
      });
    })
    .catch(err => {
      console.error('Could not set up the database:', err.message);
      process.exit(1);
    });
}

module.exports = app;