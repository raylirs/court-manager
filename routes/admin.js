const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Court, Reservation, CourtBlock, SystemSetting, User } = require('../models');
const { requireAuth, redirectIfAuth } = require('../middleware/auth');
const upload = require('../config/upload');
const { formatCurrency, formatTime12, formatDateDisplay } = require('../utils/dateTimeUtils');
const emailService = require('../services/emailService');
const facebookService = require('../services/facebookService');
const { Op } = require('sequelize');

// Helper to get settings map
async function getSettingsMap() {
  const rows = await SystemSetting.findAll();
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return map;
}

// Helper to save multiple settings
async function saveSettings(obj) {
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      await SystemSetting.upsert({
        key,
        value: typeof value === 'string' ? value.trim() : String(value)
      });
    }
  }
}

// Middleware to inject common admin locals
router.use(async (req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.currentUser = req.session ? req.session.user : null;
  res.locals.formatCurrency = formatCurrency;
  res.locals.formatTime12 = formatTime12;
  res.locals.formatDateDisplay = formatDateDisplay;

  try {
    const settings = await getSettingsMap();
    res.locals.venueName = settings.VENUE_NAME || 'Court Manager';
    res.locals.settings = settings;
  } catch (e) {
    res.locals.venueName = 'Court Manager';
    res.locals.settings = {};
  }
  next();
});

// ===================== AUTHENTICATION =====================

router.get('/login', redirectIfAuth, (req, res) => {
  res.render('admin/login', { layout: false, title: 'Admin Login' });
});

router.post('/login', redirectIfAuth, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email: email.trim().toLowerCase(), is_active: true } });

    if (!user || !(await user.validPassword(password))) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/admin/login');
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    req.flash('success', `Welcome back, ${user.name}!`);
    return res.redirect('/admin');
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error', 'Authentication error.');
    res.redirect('/admin/login');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

// All following routes require authentication
router.use(requireAuth);

// ===================== DASHBOARD =====================

router.get('/', async (req, res) => {
  try {
    const totalBookings = await Reservation.count();
    const confirmedCount = await Reservation.count({ where: { payment_status: 'confirmed' } });
    const pendingCount = await Reservation.count({ where: { payment_status: 'pending_payment' } });
    const activeCourts = await Court.count({ where: { is_active: true } });

    const totalRevenueSum = await Reservation.sum('total_price', {
      where: { payment_status: { [Op.in]: ['confirmed', 'pending_payment'] } }
    });

    const recentBookings = await Reservation.findAll({
      limit: 8,
      order: [['created_at', 'DESC']],
      include: [{ model: Court, as: 'court' }]
    });

    res.render('admin/dashboard', {
      pageTitle: 'Operations Dashboard',
      stats: {
        totalBookings,
        confirmedBookings: confirmedCount,
        pendingBookings: pendingCount,
        activeCourts,
        totalRevenue: totalRevenueSum || 0
      },
      recentBookings
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).send('Dashboard Error');
  }
});

// ===================== COURTS MANAGEMENT =====================

router.get('/courts', async (req, res) => {
  try {
    const courts = await Court.findAll({ order: [['court_number', 'ASC'], ['id', 'ASC']] });
    res.render('admin/courts', { pageTitle: 'Courts & Pricing', courts });
  } catch (err) {
    res.status(500).send('Error loading courts');
  }
});

router.get('/courts/new', (req, res) => {
  res.render('admin/court-form', { pageTitle: 'Add New Court', isEdit: false, court: null });
});

router.post('/courts', upload.single('image'), async (req, res) => {
  try {
    const { name, court_number, surface_type, price_per_hour, description, is_active } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    await Court.create({
      name: name.trim(),
      court_number: parseInt(court_number, 10) || 1,
      surface_type: surface_type ? surface_type.trim() : 'Indoor Acrylic',
      price_per_hour: parseFloat(price_per_hour) || 500.00,
      description: description ? description.trim() : null,
      image_url: imageUrl,
      is_active: is_active === 'true'
    });

    req.flash('success', `Court "${name}" created successfully.`);
    res.redirect('/admin/courts');
  } catch (err) {
    console.error('Error creating court:', err);
    req.flash('error', 'Failed to create court: ' + err.message);
    res.redirect('/admin/courts/new');
  }
});

router.get('/courts/:id/edit', async (req, res) => {
  try {
    const court = await Court.findByPk(req.params.id);
    if (!court) {
      req.flash('error', 'Court not found.');
      return res.redirect('/admin/courts');
    }
    res.render('admin/court-form', { pageTitle: 'Edit Court', isEdit: true, court });
  } catch (err) {
    res.redirect('/admin/courts');
  }
});

router.post('/courts/:id/update', upload.single('image'), async (req, res) => {
  try {
    const court = await Court.findByPk(req.params.id);
    if (!court) {
      req.flash('error', 'Court not found.');
      return res.redirect('/admin/courts');
    }

    const { name, court_number, surface_type, price_per_hour, description, is_active } = req.body;

    court.name = name.trim();
    court.court_number = parseInt(court_number, 10) || court.court_number;
    court.surface_type = surface_type ? surface_type.trim() : court.surface_type;
    court.price_per_hour = parseFloat(price_per_hour) || court.price_per_hour;
    court.description = description ? description.trim() : null;
    court.is_active = is_active === 'true';

    if (req.file) {
      court.image_url = `/uploads/${req.file.filename}`;
    }

    await court.save();
    req.flash('success', `Court "${court.name}" updated successfully.`);
    res.redirect('/admin/courts');
  } catch (err) {
    req.flash('error', 'Failed to update court: ' + err.message);
    res.redirect('/admin/courts');
  }
});

router.post('/courts/:id/toggle', async (req, res) => {
  try {
    const court = await Court.findByPk(req.params.id);
    if (court) {
      court.is_active = !court.is_active;
      await court.save();
      req.flash('success', `Court "${court.name}" is now ${court.is_active ? 'Active' : 'Paused'}.`);
    }
    res.redirect('/admin/courts');
  } catch (err) {
    res.redirect('/admin/courts');
  }
});

router.post('/courts/:id/delete', async (req, res) => {
  try {
    const court = await Court.findByPk(req.params.id);
    if (court) {
      await court.destroy();
      req.flash('success', `Court "${court.name}" deleted.`);
    }
    res.redirect('/admin/courts');
  } catch (err) {
    req.flash('error', 'Cannot delete court with existing reservations.');
    res.redirect('/admin/courts');
  }
});

// ===================== RESERVATIONS =====================

router.get('/reservations', async (req, res) => {
  try {
    const query = req.query.q ? req.query.q.trim() : '';
    const statusFilter = req.query.status || '';
    const dateFilter = req.query.date || '';

    const where = {};

    if (query) {
      where[Op.or] = [
        { reference_code: { [Op.like]: `%${query}%` } },
        { player_name: { [Op.like]: `%${query}%` } },
        { player_email: { [Op.like]: `%${query}%` } },
        { player_phone: { [Op.like]: `%${query}%` } },
        { gcash_reference_no: { [Op.like]: `%${query}%` } }
      ];
    }

    if (statusFilter) {
      where.payment_status = statusFilter;
    }

    if (dateFilter) {
      where.booking_date = dateFilter;
    }

    const reservations = await Reservation.findAll({
      where,
      include: [{ model: Court, as: 'court' }],
      order: [['created_at', 'DESC']]
    });

    const pendingCount = await Reservation.count({ where: { payment_status: 'pending_payment' } });
    const confirmedCount = await Reservation.count({ where: { payment_status: 'confirmed' } });

    res.render('admin/reservations', {
      pageTitle: 'Reservation Management',
      reservations,
      query,
      statusFilter,
      dateFilter,
      pendingCount,
      confirmedCount
    });
  } catch (err) {
    console.error('Error fetching reservations:', err);
    res.status(500).send('Error loading reservations');
  }
});

router.post('/reservations/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const reservation = await Reservation.findByPk(req.params.id, {
      include: [{ model: Court, as: 'court' }]
    });

    if (reservation) {
      reservation.payment_status = status;
      await reservation.save();

      // If confirming, send email receipt
      if (status === 'confirmed') {
        emailService.sendBookingConfirmation(reservation, reservation.court).catch(console.error);
      }

      req.flash('success', `Reservation ${reservation.reference_code} status updated to ${status}.`);
    }

    res.redirect('/admin/reservations');
  } catch (err) {
    req.flash('error', 'Failed to update reservation status.');
    res.redirect('/admin/reservations');
  }
});

// ===================== BLOCKS & MAINTENANCE =====================

router.get('/blocks', async (req, res) => {
  try {
    const courts = await Court.findAll({ where: { is_active: true } });
    const blocks = await CourtBlock.findAll({
      include: [{ model: Court, as: 'court' }],
      order: [['block_date', 'ASC'], ['start_time', 'ASC']]
    });

    res.render('admin/blocks', {
      pageTitle: 'Court Blocks & Maintenance',
      courts,
      blocks,
      today: new Date().toISOString().split('T')[0]
    });
  } catch (err) {
    res.status(500).send('Error loading blocks');
  }
});

router.post('/blocks', async (req, res) => {
  try {
    const { court_id, block_date, start_time, end_time, reason } = req.body;

    await CourtBlock.create({
      court_id: court_id ? parseInt(court_id, 10) : null,
      block_date,
      start_time,
      end_time,
      reason: reason ? reason.trim() : 'Maintenance / Tournament'
    });

    req.flash('success', 'Time slot blocked successfully.');
    res.redirect('/admin/blocks');
  } catch (err) {
    req.flash('error', 'Failed to create block: ' + err.message);
    res.redirect('/admin/blocks');
  }
});

router.post('/blocks/:id/delete', async (req, res) => {
  try {
    const block = await CourtBlock.findByPk(req.params.id);
    if (block) {
      await block.destroy();
      req.flash('success', 'Time block removed. Slot is now reopened.');
    }
    res.redirect('/admin/blocks');
  } catch (err) {
    res.redirect('/admin/blocks');
  }
});

// ===================== FACILITY & HOURS SETTINGS =====================

router.get('/venue-settings', (req, res) => {
  res.render('admin/venue-settings', { pageTitle: 'Facility & Hours' });
});

router.post('/venue-settings', async (req, res) => {
  try {
    const { VENUE_NAME, VENUE_DESCRIPTION, VENUE_ADDRESS, VENUE_PHONE, OPEN_TIME, CLOSE_TIME, SLOT_DURATION } = req.body;
    await saveSettings({
      VENUE_NAME,
      VENUE_DESCRIPTION,
      VENUE_ADDRESS,
      VENUE_PHONE,
      OPEN_TIME,
      CLOSE_TIME,
      SLOT_DURATION
    });

    req.flash('success', 'Facility profile & operating hours updated successfully.');
    res.redirect('/admin/venue-settings');
  } catch (err) {
    req.flash('error', 'Failed to save settings: ' + err.message);
    res.redirect('/admin/venue-settings');
  }
});

// ===================== GCASH SETTINGS =====================

router.get('/gcash', (req, res) => {
  res.render('admin/gcash', { pageTitle: 'GCash QR Hub' });
});

router.post('/gcash', upload.single('qr_image'), async (req, res) => {
  try {
    const { GCASH_ACCOUNT_NAME, GCASH_ACCOUNT_NUMBER } = req.body;
    const updates = {
      GCASH_ACCOUNT_NAME,
      GCASH_ACCOUNT_NUMBER
    };

    if (req.file) {
      updates.GCASH_QR_IMAGE = `/uploads/${req.file.filename}`;
    }

    await saveSettings(updates);
    req.flash('success', 'GCash merchant details and QR code updated.');
    res.redirect('/admin/gcash');
  } catch (err) {
    req.flash('error', 'Failed to save GCash settings: ' + err.message);
    res.redirect('/admin/gcash');
  }
});

// ===================== MESSENGER SETTINGS & TEST =====================

router.get('/messenger', (req, res) => {
  res.render('admin/messenger', { pageTitle: 'Meta Messenger Hub' });
});

router.post('/messenger', async (req, res) => {
  try {
    const { FB_NOTIFICATIONS_ENABLED, FB_APP_ID, FB_APP_SECRET, FB_PAGE_ID, FB_PAGE_NAME, FB_PAGE_TOKEN, FB_ADMIN_PSIDS } = req.body;
    await saveSettings({
      FB_NOTIFICATIONS_ENABLED: FB_NOTIFICATIONS_ENABLED === 'true' ? 'true' : 'false',
      FB_APP_ID,
      FB_APP_SECRET,
      FB_PAGE_ID,
      FB_PAGE_NAME,
      FB_PAGE_TOKEN,
      FB_ADMIN_PSIDS
    });

    req.flash('success', 'Facebook Messenger integration settings saved.');
    res.redirect('/admin/messenger');
  } catch (err) {
    req.flash('error', 'Failed to save Messenger settings: ' + err.message);
    res.redirect('/admin/messenger');
  }
});

router.post('/messenger/test', async (req, res) => {
  try {
    const { test_psid } = req.body;
    await facebookService.sendTestMessenger(test_psid);
    req.flash('success', `Test notification successfully delivered to PSID: ${test_psid}!`);
  } catch (err) {
    req.flash('error', `Meta Messenger Test Failed: ${err.message}`);
  }
  res.redirect('/admin/messenger');
});

// ===================== EMAIL SETTINGS & TEST =====================

router.get('/email', (req, res) => {
  res.render('admin/email', { pageTitle: 'Email & SMTP Hub' });
});

router.post('/email', async (req, res) => {
  try {
    const { EMAIL_NOTIFICATIONS_ENABLED, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_NAME, ADMIN_ALERT_EMAIL } = req.body;
    await saveSettings({
      EMAIL_NOTIFICATIONS_ENABLED: EMAIL_NOTIFICATIONS_ENABLED === 'true' ? 'true' : 'false',
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER,
      SMTP_PASS,
      SMTP_FROM_NAME,
      ADMIN_ALERT_EMAIL
    });

    req.flash('success', 'Email & SMTP settings saved.');
    res.redirect('/admin/email');
  } catch (err) {
    req.flash('error', 'Failed to save email settings: ' + err.message);
    res.redirect('/admin/email');
  }
});

router.post('/email/test', async (req, res) => {
  try {
    const { test_email } = req.body;
    await emailService.sendTestEmail(test_email);
    req.flash('success', `Test email successfully sent to ${test_email}! Check your inbox.`);
  } catch (err) {
    req.flash('error', `SMTP Connection Test Failed: ${err.message}`);
  }
  res.redirect('/admin/email');
});

module.exports = router;
