require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const cors = require('cors');

const { sequelize } = require('./models');
const seed = require('./seeds/seed');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

// Static assets
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// View Engine
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Sessions & Flash Messages
app.use(session({
  secret: process.env.SESSION_SECRET || 'court_manager_secret_super_key_2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));

app.use(flash());

// Global template variables
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success');
  res.locals.error_msg = req.flash('error');
  res.locals.user = req.session ? req.session.user : null;
  next();
});

// Routes
const publicRoutes = require('./routes/public');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

app.use('/', publicRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// 404 Not Found Handler
app.use((req, res) => {
  res.status(404).render('pages/lookup', {
    title: '404 - Page Not Found',
    venueName: 'Court Manager',
    query: '',
    results: [],
    searched: false,
    formatCurrency: () => '',
    formatDateDisplay: () => '',
    formatTime12: () => ''
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err);
  res.status(500).send(`Server Error: ${err.message}`);
});

// Start Server
async function startServer() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connection established.');

    // Auto-run seed to ensure tables and initial admin exist
    await seed();

    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`🚀 COURT MANAGER IS RUNNING AT: http://localhost:${PORT}`);
      console.log(`👑 ADMIN CONSOLE: http://localhost:${PORT}/admin`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
