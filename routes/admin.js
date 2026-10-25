const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Venue, Court, Reservation, CourtBlock, User } = require('../models');
const { requireAuth, redirectIfAuth } = require('../middleware/auth');
const upload = require('../config/upload');
const { formatCurrency, formatTime12, formatDateDisplay } = require('../utils/dateTimeUtils');
const emailService = require('../services/emailService');
const facebookService = require('../services/facebookService');
const { Op } = require('sequelize');

// Helper to determine active venue for current user
async function resolveCurrentVenue(req) {
  if (!req.session || !req.session.user) return null;
  const user = req.session.user;

  // If superadmin, allow switching venue via session or query, or default to first venue
  if (user.role === 'superadmin') {
    if (req.query.switch_venue_id) {
      req.session.activeVenueId = parseInt(req.query.switch_venue_id, 10);
    }
    const venueId = req.session.activeVenueId || (await Venue.findOne({ order: [['id', 'ASC']] }))?.id;
    if (venueId) {
      return await Venue.findByPk(venueId);
    }
    return null;
  }

  // If venue admin, strictly return their assigned venue
  if (user.venue_id) {
    return await Venue.findByPk(user.venue_id);
  }
  return null;
}

// Middleware to inject admin locals
router.use(async (req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.currentUser = req.session ? req.session.user : null;
  res.locals.formatCurrency = formatCurrency;
  res.locals.formatTime12 = formatTime12;
  res.locals.formatDateDisplay = formatDateDisplay;

  try {
    const venue = await resolveCurrentVenue(req);
    res.locals.currentVenue = venue;
    res.locals.venueName = venue ? venue.name : 'Court Manager Platform';
    res.locals.allVenues = (req.session?.user?.role === 'superadmin') ? await Venue.findAll({ order: [['name', 'ASC']] }) : [];
  } catch (e) {
    res.locals.currentVenue = null;
    res.locals.venueName = 'Court Manager Platform';
    res.locals.allVenues = [];
  }
  next();
});

// ===================== AUTHENTICATION =====================

router.get('/login', redirectIfAuth, (req, res) => {
  res.render('admin/login', { layout: false, title: 'Staff Login' });
});

router.post('/login', redirectIfAuth, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({
      where: { email: email.trim().toLowerCase(), is_active: true },
      include: [{ model: Venue, as: 'venue' }]
    });

    if (!user || !(await user.validPassword(password))) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/admin/login');
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      venue_id: user.venue_id
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

// Protected routes
router.use(requireAuth);

// ===================== SUPERADMIN VENUES MANAGEMENT =====================

router.get('/venues', async (req, res) => {
  if (req.session.user.role !== 'superadmin') {
    return res.redirect('/admin');
  }

  const venues = await Venue.findAll({
    include: [
      { model: Court, as: 'courts' },
      { model: Reservation, as: 'reservations' },
      { model: User, as: 'managers' }
    ],
    order: [['created_at', 'DESC']]
  });

  res.render('admin/superadmin-venues', { pageTitle: 'Platform Venues & Clients', venues });
});

router.post('/venues', upload.single('logo'), async (req, res) => {
  if (req.session.user.role !== 'superadmin') {
    return res.redirect('/admin');
  }

  try {
    const { name, slug, address, contact_phone, contact_email, admin_name, admin_email, admin_password } = req.body;
    const cleanSlug = slug ? slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const logoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // Create Venue
    const venue = await Venue.create({
      name: name.trim(),
      slug: cleanSlug,
      address: address ? address.trim() : null,
      contact_phone: contact_phone ? contact_phone.trim() : null,
      contact_email: contact_email ? contact_email.trim() : null,
      logo_url: logoUrl,
      is_active: true
    });

    // Create Venue Admin User
    if (admin_email && admin_password) {
      const hashedPassword = await bcrypt.hash(admin_password, 10);
      await User.create({
        venue_id: venue.id,
        name: admin_name ? admin_name.trim() : `${venue.name} Admin`,
        email: admin_email.trim().toLowerCase(),
        password_hash: hashedPassword,
        role: 'venue_admin',
        is_active: true
      });
    }

    req.flash('success', `Venue "${venue.name}" created successfully! Public link: /v/${venue.slug}`);
    res.redirect('/admin/venues');
  } catch (err) {
    req.flash('error', 'Failed to create venue: ' + err.message);
    res.redirect('/admin/venues');
  }
});

// ===================== DASHBOARD =====================

router.get('/', async (req, res) => {
  try {
    const venue = res.locals.currentVenue;
    const isSuper = req.session.user.role === 'superadmin';

    const where = {};
    if (!isSuper && venue) {
      where.venue_id = venue.id;
    } else if (isSuper && req.session.activeVenueId) {
      where.venue_id = req.session.activeVenueId;
    }

    const totalBookings = await Reservation.count({ where });
    const confirmedCount = await Reservation.count({ where: { ...where, payment_status: 'confirmed' } });
    const pendingCount = await Reservation.count({ where: { ...where, payment_status: 'pending_payment' } });
    const activeCourts = await Court.count({ where: { ...where, is_active: true } });

    const totalRevenueSum = await Reservation.sum('total_price', {
      where: { ...where, payment_status: { [Op.in]: ['confirmed', 'pending_payment'] } }
    });

    const recentBookings = await Reservation.findAll({
      where,
      limit: 8,
      order: [['created_at', 'DESC']],
      include: [
        { model: Court, as: 'court' },
        { model: Venue, as: 'venue' }
      ]
    });

    res.render('admin/dashboard', {
      pageTitle: venue ? `${venue.name} Dashboard` : 'Platform Operations Dashboard',
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
    const venue = res.locals.currentVenue;
    const where = venue ? { venue_id: venue.id } : {};
    const courts = await Court.findAll({ where, order: [['court_number', 'ASC'], ['id', 'ASC']] });
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
    const venue = res.locals.currentVenue;
    if (!venue) {
      req.flash('error', 'Please select or create a venue first.');
      return res.redirect('/admin/courts');
    }

    const { name, court_number, surface_type, price_per_hour, description, is_active } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    await Court.create({
      venue_id: venue.id,
      name: name.trim(),
      court_number: parseInt(court_number, 10) || 1,
      surface_type: surface_type ? surface_type.trim() : 'Indoor Acrylic',
      price_per_hour: parseFloat(price_per_hour) || 500.00,
      description: description ? description.trim() : null,
      image_url: imageUrl,
      is_active: is_active === 'true'
    });

    req.flash('success', `Court "${name}" added to ${venue.name}.`);
    res.redirect('/admin/courts');
  } catch (err) {
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
    if (!court) return res.redirect('/admin/courts');

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
      req.flash('success', `Court "${court.name}" status updated.`);
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
    req.flash('error', 'Cannot delete court with active reservations.');
    res.redirect('/admin/courts');
  }
});

// ===================== RESERVATIONS =====================

router.get('/reservations', async (req, res) => {
  try {
    const venue = res.locals.currentVenue;
    const query = req.query.q ? req.query.q.trim() : '';
    const statusFilter = req.query.status || '';
    const dateFilter = req.query.date || '';

    const where = {};
    if (venue) where.venue_id = venue.id;

    if (query) {
      where[Op.or] = [
        { reference_code: { [Op.like]: `%${query}%` } },
        { player_name: { [Op.like]: `%${query}%` } },
        { player_email: { [Op.like]: `%${query}%` } },
        { player_phone: { [Op.like]: `%${query}%` } },
        { gcash_reference_no: { [Op.like]: `%${query}%` } }
      ];
    }

    if (statusFilter) where.payment_status = statusFilter;
    if (dateFilter) where.booking_date = dateFilter;

    const reservations = await Reservation.findAll({
      where,
      include: [
        { model: Court, as: 'court' },
        { model: Venue, as: 'venue' }
      ],
      order: [['created_at', 'DESC']]
    });

    const pendingCount = await Reservation.count({ where: { ...where, payment_status: 'pending_payment' } });
    const confirmedCount = await Reservation.count({ where: { ...where, payment_status: 'confirmed' } });

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
    res.status(500).send('Error loading reservations');
  }
});

router.post('/reservations/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const reservation = await Reservation.findByPk(req.params.id, {
      include: [
        { model: Court, as: 'court' },
        { model: Venue, as: 'venue' }
      ]
    });

    if (reservation) {
      reservation.payment_status = status;
      await reservation.save();

      if (status === 'confirmed') {
        emailService.sendBookingConfirmation(reservation, reservation.court, reservation.venue).catch(console.error);
      }
      req.flash('success', `Reservation ${reservation.reference_code} status updated to ${status}.`);
    }

    res.redirect('/admin/reservations');
  } catch (err) {
    res.redirect('/admin/reservations');
  }
});

// ===================== BLOCKS & MAINTENANCE =====================

router.get('/blocks', async (req, res) => {
  try {
    const venue = res.locals.currentVenue;
    const where = venue ? { venue_id: venue.id } : {};
    const courts = await Court.findAll({ where: { ...where, is_active: true } });
    const blocks = await CourtBlock.findAll({
      where,
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
    const venue = res.locals.currentVenue;
    if (!venue) return res.redirect('/admin/blocks');

    const { court_id, block_date, start_time, end_time, reason } = req.body;
    await CourtBlock.create({
      venue_id: venue.id,
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
      req.flash('success', 'Time block removed.');
    }
    res.redirect('/admin/blocks');
  } catch (err) {
    res.redirect('/admin/blocks');
  }
});

// ===================== VENUE PROFILE & HOURS =====================

router.get('/venue-settings', (req, res) => {
  res.render('admin/venue-settings', { pageTitle: 'Facility & Hours' });
});

router.post('/venue-settings', async (req, res) => {
  try {
    const venue = res.locals.currentVenue;
    if (!venue) return res.redirect('/admin');

    const { name, description, address, contact_phone, contact_email, open_time, close_time, slot_duration } = req.body;
    venue.name = name.trim();
    venue.description = description ? description.trim() : null;
    venue.address = address ? address.trim() : null;
    venue.contact_phone = contact_phone ? contact_phone.trim() : null;
    venue.contact_email = contact_email ? contact_email.trim() : null;
    venue.open_time = open_time || '06:00';
    venue.close_time = close_time || '22:00';
    venue.slot_duration = parseInt(slot_duration, 10) || 60;

    await venue.save();
    req.flash('success', 'Facility profile & operating hours updated.');
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
    const venue = res.locals.currentVenue;
    if (!venue) return res.redirect('/admin');

    const { gcash_account_name, gcash_account_number } = req.body;
    venue.gcash_account_name = gcash_account_name ? gcash_account_name.trim() : null;
    venue.gcash_account_number = gcash_account_number ? gcash_account_number.trim() : null;

    if (req.file) {
      venue.gcash_qr_image = `/uploads/${req.file.filename}`;
    }

    await venue.save();
    req.flash('success', 'GCash merchant details and QR code updated.');
    res.redirect('/admin/gcash');
  } catch (err) {
    req.flash('error', 'Failed to save GCash settings: ' + err.message);
    res.redirect('/admin/gcash');
  }
});

// ===================== MESSENGER SETTINGS =====================

router.get('/messenger', (req, res) => {
  res.render('admin/messenger', { pageTitle: 'Meta Messenger Hub' });
});

router.post('/messenger', async (req, res) => {
  try {
    const venue = res.locals.currentVenue;
    if (!venue) return res.redirect('/admin');

    const { fb_enabled, fb_app_id, fb_app_secret, fb_page_id, fb_page_name, fb_page_token, fb_admin_psids } = req.body;
    venue.fb_enabled = fb_enabled === 'true';
    venue.fb_app_id = fb_app_id ? fb_app_id.trim() : null;
    venue.fb_app_secret = fb_app_secret ? fb_app_secret.trim() : null;
    venue.fb_page_id = fb_page_id ? fb_page_id.trim() : null;
    venue.fb_page_name = fb_page_name ? fb_page_name.trim() : null;
    venue.fb_page_token = fb_page_token ? fb_page_token.trim() : null;
    venue.fb_admin_psids = fb_admin_psids ? fb_admin_psids.trim() : null;

    await venue.save();
    req.flash('success', 'Facebook Messenger integration settings saved for ' + venue.name);
    res.redirect('/admin/messenger');
  } catch (err) {
    req.flash('error', 'Failed to save Messenger settings: ' + err.message);
    res.redirect('/admin/messenger');
  }
});

router.post('/messenger/test', async (req, res) => {
  try {
    const venue = res.locals.currentVenue;
    const { test_psid } = req.body;
    await facebookService.sendTestMessenger(test_psid, venue);
    req.flash('success', `Test notification successfully delivered to PSID: ${test_psid}!`);
  } catch (err) {
    req.flash('error', `Meta Messenger Test Failed: ${err.message}`);
  }
  res.redirect('/admin/messenger');
});

// ===================== EMAIL SETTINGS =====================

router.get('/email', (req, res) => {
  res.render('admin/email', { pageTitle: 'Email & SMTP Hub' });
});

router.post('/email', async (req, res) => {
  try {
    const venue = res.locals.currentVenue;
    if (!venue) return res.redirect('/admin');

    const { email_enabled, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from_name, admin_alert_email } = req.body;
    venue.email_enabled = email_enabled === 'true';
    venue.smtp_host = smtp_host ? smtp_host.trim() : null;
    venue.smtp_port = parseInt(smtp_port, 10) || 465;
    venue.smtp_user = smtp_user ? smtp_user.trim() : null;
    venue.smtp_pass = smtp_pass ? smtp_pass.trim() : null;
    venue.smtp_from_name = smtp_from_name ? smtp_from_name.trim() : null;
    venue.admin_alert_email = admin_alert_email ? admin_alert_email.trim() : null;

    await venue.save();
    req.flash('success', 'Email & SMTP settings saved for ' + venue.name);
    res.redirect('/admin/email');
  } catch (err) {
    req.flash('error', 'Failed to save email settings: ' + err.message);
    res.redirect('/admin/email');
  }
});

router.post('/email/test', async (req, res) => {
  try {
    const venue = res.locals.currentVenue;
    const { test_email } = req.body;
    await emailService.sendTestEmail(test_email, venue);
    req.flash('success', `Test email successfully sent to ${test_email}! Check your inbox.`);
  } catch (err) {
    req.flash('error', `SMTP Connection Test Failed: ${err.message}`);
  }
  res.redirect('/admin/email');
});

// ===================== SETUP GUIDES & DOCUMENTATION =====================

router.get('/guides', (req, res) => {
  res.render('admin/guides', { pageTitle: 'Setup Guides & Documentation' });
});

module.exports = router;
