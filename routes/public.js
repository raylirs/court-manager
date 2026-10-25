const express = require('express');
const router = express.Router();
const { Court, Reservation, SystemSetting } = require('../models');
const { formatCurrency, formatTime12, formatDateDisplay, generateReference } = require('../utils/dateTimeUtils');
const upload = require('../config/upload');
const emailService = require('../services/emailService');
const facebookService = require('../services/facebookService');
const { Op } = require('sequelize');

// Helper to fetch all settings as key-value map
async function getSettingsMap() {
  const rows = await SystemSetting.findAll();
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return map;
}

// GET / - Public Booking Portal
router.get('/', async (req, res) => {
  try {
    const settings = await getSettingsMap();
    const courts = await Court.findAll({
      where: { is_active: true },
      order: [['court_number', 'ASC'], ['id', 'ASC']]
    });

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

    res.render('pages/index', {
      title: 'Court Booking',
      venueName: settings.VENUE_NAME || 'Court Manager',
      venueDescription: settings.VENUE_DESCRIPTION || '',
      venueAddress: settings.VENUE_ADDRESS || '',
      openTime: settings.OPEN_TIME || '06:00',
      closeTime: settings.CLOSE_TIME || '22:00',
      courts,
      selectedDate,
      minDate: isoToday,
      datePills,
      formatCurrency,
      formatTime12,
      formatDateDisplay
    });
  } catch (err) {
    console.error('Error rendering public booking page:', err);
    res.status(500).send('Server Error');
  }
});

// POST /checkout-step
router.post('/checkout-step', async (req, res) => {
  try {
    const { court_id, booking_date, selected_slots } = req.body;

    if (!court_id || !booking_date || !selected_slots) {
      req.flash('error', 'Please choose a court, date, and at least one time slot.');
      return res.redirect('/');
    }

    let parsedSlots = [];
    try {
      parsedSlots = JSON.parse(selected_slots);
    } catch (e) {
      parsedSlots = [];
    }

    if (!Array.isArray(parsedSlots) || parsedSlots.length === 0) {
      req.flash('error', 'Please select at least one available time slot.');
      return res.redirect('/');
    }

    // Save selection in session for checkout
    req.session.bookingDraft = {
      court_id: parseInt(court_id, 10),
      booking_date,
      slots: parsedSlots
    };

    return res.redirect('/checkout');
  } catch (err) {
    console.error('Error in checkout-step:', err);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/');
  }
});

// GET /checkout
router.get('/checkout', async (req, res) => {
  try {
    const draft = req.session.bookingDraft;
    if (!draft || !draft.court_id || !draft.slots || draft.slots.length === 0) {
      req.flash('error', 'No court reservation selected. Please choose a slot first.');
      return res.redirect('/');
    }

    const court = await Court.findByPk(draft.court_id);
    if (!court) {
      req.flash('error', 'The selected court could not be found.');
      return res.redirect('/');
    }

    const settings = await getSettingsMap();
    const totalHours = draft.slots.length;
    const totalPrice = parseFloat(court.price_per_hour) * totalHours;
    const slotLabels = draft.slots.map(s => s.label);

    res.render('pages/checkout', {
      title: 'Checkout & GCash Payment',
      venueName: settings.VENUE_NAME || 'Court Manager',
      court,
      bookingDate: draft.booking_date,
      slots: draft.slots,
      slotLabels,
      totalHours,
      totalPrice,
      selectedSlotsRaw: JSON.stringify(draft.slots),
      gcashQrImage: settings.GCASH_QR_IMAGE || '',
      gcashAccountName: settings.GCASH_ACCOUNT_NAME || '',
      gcashAccountNumber: settings.GCASH_ACCOUNT_NUMBER || '',
      formatCurrency,
      formatDateDisplay,
      formatTime12
    });
  } catch (err) {
    console.error('Error rendering checkout:', err);
    res.redirect('/');
  }
});

// POST /confirm-booking (With optional payment receipt upload)
router.post('/confirm-booking', upload.single('payment_proof'), async (req, res) => {
  try {
    const { court_id, booking_date, selected_slots, player_name, player_phone, player_email, notes, gcash_reference_no } = req.body;

    if (!court_id || !booking_date || !selected_slots || !player_name || !player_phone || !player_email) {
      req.flash('error', 'Please fill in all required fields.');
      return res.redirect('/checkout');
    }

    let parsedSlots = [];
    try {
      parsedSlots = JSON.parse(selected_slots);
    } catch (e) {
      parsedSlots = [];
    }

    if (parsedSlots.length === 0) {
      req.flash('error', 'Invalid slot selection.');
      return res.redirect('/');
    }

    const court = await Court.findByPk(court_id);
    if (!court) {
      req.flash('error', 'Court not found.');
      return res.redirect('/');
    }

    // Determine continuous or multiple slot range
    const startTime = parsedSlots[0].start;
    const endTime = parsedSlots[parsedSlots.length - 1].end;
    const totalHours = parsedSlots.length;
    const totalPrice = parseFloat(court.price_per_hour) * totalHours;
    const referenceCode = generateReference();

    const paymentProofPath = req.file ? `/uploads/${req.file.filename}` : null;

    // Create reservation record
    const reservation = await Reservation.create({
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

    // Clear session draft
    req.session.bookingDraft = null;

    // Asynchronous Notifications (Email & Facebook Messenger)
    emailService.sendBookingConfirmation(reservation, court).catch(console.error);
    emailService.sendAdminNewBookingAlert(reservation, court).catch(console.error);
    facebookService.sendBookingAlertToAdmin(reservation, court).catch(console.error);

    return res.redirect(`/booking/${reservation.reference_code}`);
  } catch (err) {
    console.error('Error confirming booking:', err);
    req.flash('error', 'Failed to complete booking: ' + err.message);
    res.redirect('/checkout');
  }
});

// GET /booking/:reference_code
router.get('/booking/:reference_code', async (req, res) => {
  try {
    const reservation = await Reservation.findOne({
      where: { reference_code: req.params.reference_code },
      include: [{ model: Court, as: 'court' }]
    });

    if (!reservation) {
      req.flash('error', 'Booking reference not found.');
      return res.redirect('/lookup');
    }

    const settings = await getSettingsMap();

    res.render('pages/booking-success', {
      title: 'Booking Confirmation',
      venueName: settings.VENUE_NAME || 'Court Manager',
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
        include: [{ model: Court, as: 'court' }],
        order: [['created_at', 'DESC']]
      });
    }

    const settings = await getSettingsMap();

    res.render('pages/lookup', {
      title: 'Reservation Lookup',
      venueName: settings.VENUE_NAME || 'Court Manager',
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
