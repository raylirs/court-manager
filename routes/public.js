const express = require('express');
const router = express.Router();
const { Venue, Court, Reservation } = require('../models');
const { formatCurrency, formatTime12, formatDateDisplay, generateReference } = require('../utils/dateTimeUtils');
const upload = require('../config/upload');
const emailService = require('../services/emailService');
const facebookService = require('../services/facebookService');
const { Op } = require('sequelize');

// GET / - Public Directory of All Partner Clubs & Venues
router.get('/', async (req, res) => {
  try {
    const search = req.query.q ? req.query.q.trim() : '';
    const where = { is_active: true };

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { address: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    const venues = await Venue.findAll({
      where,
      include: [{ model: Court, as: 'courts', where: { is_active: true }, required: false }],
      order: [['name', 'ASC']]
    });

    res.render('pages/index', {
      title: 'Find & Reserve Sports Courts',
      venues,
      search,
      formatCurrency,
      formatTime12
    });
  } catch (err) {
    console.error('Error rendering homepage directory:', err);
    res.status(500).send('Server Error');
  }
});

// GET /v/:slug - Venue-Specific Booking Portal
router.get('/v/:slug', async (req, res) => {
  try {
    const venue = await Venue.findOne({
      where: { slug: req.params.slug, is_active: true },
      include: [{ model: Court, as: 'courts', where: { is_active: true }, required: false }]
    });

    if (!venue) {
      req.flash('error', 'Venue not found or inactive.');
      return res.redirect('/');
    }

    // Date calculations: today + 7 quick pills
    const now = new Date();
    const isoToday = now.toISOString().split('T')[0];
    const selectedDate = req.query.date || isoToday;

    const datePills = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(now.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      datePills.push({
        isoDate: iso,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
        monthName: d.toLocaleDateString('en-US', { month: 'short' })
      });
    }

    res.render('pages/venue-booking', {
      title: `${venue.name} | Reserve Court`,
      venue,
      courts: venue.courts || [],
      selectedDate,
      minDate: isoToday,
      datePills,
      formatCurrency,
      formatTime12,
      formatDateDisplay
    });
  } catch (err) {
    console.error('Error rendering venue booking page:', err);
    res.status(500).send('Server Error');
  }
});

// POST /v/:slug/checkout-step
router.post('/v/:slug/checkout-step', async (req, res) => {
  try {
    const { court_id, booking_date, selected_slots } = req.body;
    const slug = req.params.slug;

    if (!court_id || !booking_date || !selected_slots) {
      req.flash('error', 'Please choose a court, date, and at least one time slot.');
      return res.redirect(`/v/${slug}`);
    }

    let parsedSlots = [];
    try {
      parsedSlots = JSON.parse(selected_slots);
    } catch (e) {
      parsedSlots = [];
    }

    if (!Array.isArray(parsedSlots) || parsedSlots.length === 0) {
      req.flash('error', 'Please select at least one available time slot.');
      return res.redirect(`/v/${slug}`);
    }

    req.session.bookingDraft = {
      venue_slug: slug,
      court_id: parseInt(court_id, 10),
      booking_date,
      slots: parsedSlots
    };

    return res.redirect(`/v/${slug}/checkout`);
  } catch (err) {
    console.error('Error in checkout-step:', err);
    res.redirect(`/v/${req.params.slug}`);
  }
});

// GET /v/:slug/checkout
router.get('/v/:slug/checkout', async (req, res) => {
  try {
    const draft = req.session.bookingDraft;
    const slug = req.params.slug;

    if (!draft || draft.venue_slug !== slug || !draft.court_id || !draft.slots || draft.slots.length === 0) {
      req.flash('error', 'No reservation selected. Please choose your slots first.');
      return res.redirect(`/v/${slug}`);
    }

    const venue = await Venue.findOne({ where: { slug, is_active: true } });
    const court = await Court.findByPk(draft.court_id);

    if (!venue || !court) {
      req.flash('error', 'Venue or court could not be found.');
      return res.redirect('/');
    }

    const totalHours = draft.slots.length;
    const totalPrice = parseFloat(court.price_per_hour) * totalHours;
    const slotLabels = draft.slots.map(s => s.label);

    res.render('pages/checkout', {
      title: `Checkout | ${venue.name}`,
      venue,
      court,
      bookingDate: draft.booking_date,
      slots: draft.slots,
      slotLabels,
      totalHours,
      totalPrice,
      selectedSlotsRaw: JSON.stringify(draft.slots),
      formatCurrency,
      formatDateDisplay,
      formatTime12
    });
  } catch (err) {
    console.error('Error rendering checkout:', err);
    res.redirect('/');
  }
});

// POST /v/:slug/confirm-booking
router.post('/v/:slug/confirm-booking', upload.single('payment_proof'), async (req, res) => {
  try {
    const slug = req.params.slug;
    const venue = await Venue.findOne({ where: { slug, is_active: true } });
    if (!venue) return res.redirect('/');

    const { court_id, booking_date, selected_slots, player_name, player_phone, player_email, notes, gcash_reference_no } = req.body;

    if (!court_id || !booking_date || !selected_slots || !player_name || !player_phone || !player_email) {
      req.flash('error', 'Please fill in all required fields.');
      return res.redirect(`/v/${slug}/checkout`);
    }

    let parsedSlots = [];
    try { parsedSlots = JSON.parse(selected_slots); } catch (e) { parsedSlots = []; }

    if (parsedSlots.length === 0) {
      req.flash('error', 'Invalid slot selection.');
      return res.redirect(`/v/${slug}`);
    }

    const court = await Court.findByPk(court_id);
    if (!court) {
      req.flash('error', 'Court not found.');
      return res.redirect(`/v/${slug}`);
    }

    const startTime = parsedSlots[0].start;
    const endTime = parsedSlots[parsedSlots.length - 1].end;
    const totalHours = parsedSlots.length;
    const totalPrice = parseFloat(court.price_per_hour) * totalHours;
    const referenceCode = generateReference();
    const paymentProofPath = req.file ? `/uploads/${req.file.filename}` : null;

    const reservation = await Reservation.create({
      venue_id: venue.id,
      reference_code: referenceCode,
      court_id: court.id,
      booking_date: booking_date,
      start_time: startTime,
      end_time: endTime,
      duration_hours: totalHours,
      total_price: totalPrice,
      player_name: player_name.trim(),
      player_email: player_email.trim().toLowerCase(),
      player_phone: player_phone.trim(),
      notes: notes ? notes.trim() : null,
      payment_method: 'gcash',
      payment_status: 'pending_payment',
      gcash_reference_no: gcash_reference_no ? gcash_reference_no.trim() : null,
      payment_proof_image: paymentProofPath
    });

    req.session.bookingDraft = null;

    // Asynchronous venue-scoped notifications
    emailService.sendBookingConfirmation(reservation, court, venue).catch(console.error);
    emailService.sendAdminNewBookingAlert(reservation, court, venue).catch(console.error);
    facebookService.sendBookingAlertToAdmin(reservation, court, venue).catch(console.error);

    return res.redirect(`/booking/${reservation.reference_code}`);
  } catch (err) {
    console.error('Error confirming booking:', err);
    req.flash('error', 'Failed to complete booking: ' + err.message);
    res.redirect(`/v/${req.params.slug}/checkout`);
  }
});

// GET /booking/:reference_code
router.get('/booking/:reference_code', async (req, res) => {
  try {
    const reservation = await Reservation.findOne({
      where: { reference_code: req.params.reference_code },
      include: [
        { model: Court, as: 'court' },
        { model: Venue, as: 'venue' }
      ]
    });

    if (!reservation) {
      req.flash('error', 'Booking reference not found.');
      return res.redirect('/lookup');
    }

    res.render('pages/booking-success', {
      title: 'Booking Receipt',
      venue: reservation.venue,
      reservation,
      court: reservation.court,
      formatCurrency,
      formatDateDisplay,
      formatTime12
    });
  } catch (err) {
    console.error('Error rendering booking confirmation:', err);
    res.redirect('/');
  }
});

// GET /lookup
router.get('/lookup', async (req, res) => {
  try {
    const query = req.query.q ? req.query.q.trim() : '';
    let results = [];
    let searched = false;

    if (query) {
      searched = true;
      results = await Reservation.findAll({
        where: {
          [Op.or]: [
            { reference_code: { [Op.like]: `%${query}%` } },
            { player_email: { [Op.like]: `%${query}%` } },
            { player_phone: { [Op.like]: `%${query}%` } }
          ]
        },
        include: [
          { model: Court, as: 'court' },
          { model: Venue, as: 'venue' }
        ],
        order: [['created_at', 'DESC']]
      });
    }

    res.render('pages/lookup', {
      title: 'Reservation Lookup',
      query,
      results,
      searched,
      formatCurrency,
      formatDateDisplay,
      formatTime12
    });
  } catch (err) {
    console.error('Error in lookup:', err);
    res.redirect('/');
  }
});

module.exports = router;
