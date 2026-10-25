const express = require('express');
const router = express.Router();
const { Court, Reservation, CourtBlock, SystemSetting } = require('../models');
const { generateSlots } = require('../utils/dateTimeUtils');
const { Op } = require('sequelize');

// Helper to check if two time ranges overlap (format "HH:mm")
function timesOverlap(startA, endA, startB, endB) {
  return (startA < endB) && (endA > startB);
}

// GET /api/available-slots?court_id=1&date=2026-10-25
router.get('/available-slots', async (req, res) => {
  try {
    const { court_id, date } = req.query;

    if (!court_id || !date) {
      return res.status(400).json({ success: false, message: 'court_id and date query parameters are required' });
    }

    // 1. Fetch facility schedule settings
    const settingsRows = await SystemSetting.findAll({
      where: { key: ['OPEN_TIME', 'CLOSE_TIME', 'SLOT_DURATION'] }
    });
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });

    const openTime = settings.OPEN_TIME || '06:00';
    const closeTime = settings.CLOSE_TIME || '22:00';
    const stepMins = parseInt(settings.SLOT_DURATION || '60', 10);

    // 2. Generate standard base slots for the day
    const baseSlots = generateSlots(openTime, closeTime, stepMins);

    // 3. Fetch existing reservations for this court on this date (exclude cancelled)
    const reservations = await Reservation.findAll({
      where: {
        court_id: court_id,
        booking_date: date,
        payment_status: { [Op.ne]: 'cancelled' }
      }
    });

    // 4. Fetch court blocks for this court OR whole facility on this date
    const blocks = await CourtBlock.findAll({
      where: {
        block_date: date,
        [Op.or]: [
          { court_id: court_id },
          { court_id: null }
        ]
      }
    });

    // 5. Evaluate availability for each slot
    const slotsWithAvailability = baseSlots.map(slot => {
      // Check reservation conflict
      const reservedMatch = reservations.find(r => timesOverlap(slot.start, slot.end, r.start_time, r.end_time));
      if (reservedMatch) {
        return {
          ...slot,
          isAvailable: false,
          reason: 'Reserved'
        };
      }

      // Check block conflict
      const blockMatch = blocks.find(b => timesOverlap(slot.start, slot.end, b.start_time, b.end_time));
      if (blockMatch) {
        return {
          ...slot,
          isAvailable: false,
          reason: blockMatch.reason || 'Blocked'
        };
      }

      return {
        ...slot,
        isAvailable: true
      };
    });

    return res.json({
      success: true,
      court_id,
      date,
      slots: slotsWithAvailability
    });
  } catch (err) {
    console.error('Error fetching available slots:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching available slots' });
  }
});

module.exports = router;
