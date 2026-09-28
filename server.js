require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const exportRoutes = require('./routes/export');
const { migrate } = require('./db/migrate');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/export', exportRoutes);

app.get('/', (req, res) => res.redirect('/index.html'));

const PORT = process.env.PORT || 3000;
// Create/upgrade database tables first, then start listening
migrate()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Bug Tracker running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('\nCould not set up the database: ' + err.message);
    console.error('Check DB_HOST / DB_NAME / DB_USER / DB_PASSWORD in your .env file and that MySQL is running.\n');
    process.exit(1);
  });
