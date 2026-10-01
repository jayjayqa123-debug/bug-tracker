require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); // <--- 1. Import fs module

const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const exportRoutes = require('./routes/export');
const adminRoutes = require('./routes/admin');
const { migrate } = require('./db/migrate');

const app = express();

// 2. Ensure root 'uploads' folder exists BEFORE mounting static route
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());

// 3. Mount static file handlers
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => res.redirect('/index.html'));

const PORT = process.env.PORT || 3000;

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

module.exports = app;