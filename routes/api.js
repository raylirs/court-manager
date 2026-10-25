const express = require('express');
const router = express.Router();
const { Court, Reservation, CourtBlock, Venue } = require('../models');
const { generateSlots } = require('../utils/dateTimeUtils');
const { Op } = require('sequelize');

function timesOverlap(startA, endA, startB, endB) {
  return (startA < endB) && (endA > startB);
}

// GET /api/available-slots?court_id=1&date=2026-10-25
router.get('/available-slots', async (req, res) => {
  try {
    const { court_id, date } = req.query;

    if (!court_id || !date) {
      return res.status(400).json({ success: false, message: 'court_id and date are required' });
    }

    const court = await Court.findByPk(court_id, {
      include: [{ model: Venue, as: 'venue' }]
    });

    if (!court) {
      return res.status(404).json({ success: false, message: 'Court not found' });
    }

    const venue = court.venue;
    const openTime = venue ? venue.open_time : '06:00';
    const closeTime = venue ? venue.close_time : '22:00';
    const stepMins = venue ? parseInt(venue.slot_duration || '60', 10) : 60;

    // Generate candidate slots
    const baseSlots = generateSlots(openTime, closeTime, stepMins);

    // Fetch existing reservations for this court on this date (not cancelled)
    const reservations = await Reservation.findAll({
      where: {
        court_id: court.id,
        booking_date: date,
        payment_status: { [Op.ne]: 'cancelled' }
      }
    });

    // Fetch court blocks for this court OR whole facility
    const blocks = await CourtBlock.findAll({
      where: {
        venue_id: court.venue_id,
        block_date: date,
        [Op.or]: [
          { court_id: court.id },
          { court_id: null }
        ]
      }
    });

    // Evaluate availability
    const slotsWithAvailability = baseSlots.map(slot => {
      const reservedMatch = reservations.find(r => timesOverlap(slot.start, slot.end, r.start_time, r.end_time));
      if (reservedMatch) {
        return { ...slot, isAvailable: false, reason: 'Reserved' };
      }

      const blockMatch = blocks.find(b => timesOverlap(slot.start, slot.end, b.start_time, b.end_time));
      if (blockMatch) {
        return { ...slot, isAvailable: false, reason: blockMatch.reason || 'Blocked' };
      }

      return { ...slot, isAvailable: true };
    });

    return res.json({
      success: true,
      venue_id: court.venue_id,
      court_id: court.id,
      date,
      slots: slotsWithAvailability
    });
  } catch (err) {
    console.error('Error fetching available slots:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching available slots' });
  }
});

module.exports = router;
