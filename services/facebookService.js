const { formatCurrency, formatTime12 } = require('../utils/dateTimeUtils');

const FB_GRAPH_VERSION = 'v21.0';

// Sends a direct message to a PSID using Meta Send API
async function sendMessengerPayload(psid, messagePayload, pageToken) {
  const url = `https://graph.facebook.com/${FB_GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(pageToken)}`;
  
  const body = {
    recipient: { id: String(psid).trim() },
    messaging_type: 'MESSAGE_TAG',
    tag: 'CONFIRMED_EVENT_UPDATE',
    message: messagePayload
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || 'Meta API error');
  }
  return data;
}

// Sends instant booking push notification to venue admin PSIDs
async function sendBookingAlertToAdmin(reservation, court, venue = null) {
  if (!venue || !venue.fb_enabled || !venue.fb_page_token) {
    return { success: false, reason: 'Messenger notifications disabled or not configured for this venue' };
  }

  const adminPsids = (venue.fb_admin_psids || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (adminPsids.length === 0) return { success: false, reason: 'No admin PSIDs configured' };

  const text = `🎾 [${venue.name}] NEW BOOKING!
━━━━━━━━━━━━━━━━
📍 Court: ${court ? court.name : 'Court #' + reservation.court_id}
📅 Date: ${reservation.booking_date}
⏰ Time: ${formatTime12(reservation.start_time)} - ${formatTime12(reservation.end_time)} (${reservation.duration_hours}h)
👤 Player: ${reservation.player_name}
📞 Contact: ${reservation.player_phone}
💰 Amount: ${formatCurrency(reservation.total_price)}
🔖 Ref: ${reservation.reference_code}
💵 GCash Ref: ${reservation.gcash_reference_no || 'Pending verification'}
━━━━━━━━━━━━━━━━
Log into your admin dashboard to approve.`;

  const results = [];
  for (const psid of adminPsids) {
    try {
      const res = await sendMessengerPayload(psid, { text }, venue.fb_page_token);
      results.push({ psid, success: true, res });
    } catch (err) {
      console.error(`[FacebookService] Failed to send to PSID ${psid}:`, err.message);
      results.push({ psid, success: false, error: err.message });
    }
  }

  return results;
}

// Live test button
async function sendTestMessenger(targetPsid, venue) {
  const token = venue ? venue.fb_page_token : null;
  const psid = targetPsid || (venue && venue.fb_admin_psids ? venue.fb_admin_psids.split(',')[0].trim() : null);

  if (!token) throw new Error('Facebook Page Access Token is missing.');
  if (!psid) throw new Error('Recipient Facebook PSID is required for test alert.');

  const text = `🔔 [TEST NOTIFICATION]
━━━━━━━━━━━━━━━━
✅ Your Court Manager Meta Messenger integration for "${venue ? venue.name : 'Court Manager'}" is active!
You will receive live booking alerts directly on your Facebook profile whenever a player reserves a court.
━━━━━━━━━━━━━━━━
Timestamp: ${new Date().toLocaleTimeString()}`;

  return await sendMessengerPayload(psid, { text }, token);
}

module.exports = {
  sendBookingAlertToAdmin,
  sendTestMessenger
};
