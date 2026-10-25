const { SystemSetting } = require('../models');
const { formatCurrency, formatTime12 } = require('../utils/dateTimeUtils');

const FB_GRAPH_VERSION = 'v21.0';

async function resolveFacebookConfig() {
  const dbSettings = {};
  try {
    const rows = await SystemSetting.findAll({
      where: {
        key: [
          'FB_APP_ID',
          'FB_APP_SECRET',
          'FB_PAGE_ID',
          'FB_PAGE_NAME',
          'FB_PAGE_TOKEN',
          'FB_ADMIN_PSIDS',
          'FB_NOTIFICATIONS_ENABLED',
          'VENUE_NAME'
        ]
      }
    });
    rows.forEach(r => {
      if (r.value && String(r.value).trim()) {
        dbSettings[r.key] = String(r.value).trim();
      }
    });
  } catch (err) {
    console.error('Error fetching Facebook settings:', err.message);
  }

  const appId = dbSettings.FB_APP_ID || process.env.FB_APP_ID || '';
  const pageId = dbSettings.FB_PAGE_ID || process.env.FB_PAGE_ID || '';
  const pageName = dbSettings.FB_PAGE_NAME || dbSettings.VENUE_NAME || 'Court Manager';
  const pageToken = dbSettings.FB_PAGE_TOKEN || process.env.FB_PAGE_TOKEN || '';
  const adminPsidsRaw = dbSettings.FB_ADMIN_PSIDS || process.env.FB_ADMIN_PSIDS || '';
  const enabled = dbSettings.FB_NOTIFICATIONS_ENABLED !== 'false';

  const adminPsids = adminPsidsRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const isConfigured = Boolean(pageToken && adminPsids.length > 0);

  return { appId, pageId, pageName, pageToken, adminPsids, enabled, isConfigured };
}

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

// Sends instant booking push notification to all configured court admin PSIDs
async function sendBookingAlertToAdmin(reservation, court) {
  const cfg = await resolveFacebookConfig();
  if (!cfg.enabled || !cfg.isConfigured) {
    return { success: false, reason: 'Messenger notifications disabled or not configured' };
  }

  const text = `🎾 [NEW BOOKING ALERT]
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
  for (const psid of cfg.adminPsids) {
    try {
      const res = await sendMessengerPayload(psid, { text }, cfg.pageToken);
      results.push({ psid, success: true, res });
    } catch (err) {
      console.error(`[FacebookService] Failed to send to PSID ${psid}:`, err.message);
      results.push({ psid, success: false, error: err.message });
    }
  }

  return results;
}

// Live test button in Admin UI
async function sendTestMessenger(targetPsid, customToken) {
  const cfg = await resolveFacebookConfig();
  const token = customToken || cfg.pageToken;
  const psid = targetPsid || (cfg.adminPsids.length > 0 ? cfg.adminPsids[0] : null);

  if (!token) throw new Error('Facebook Page Access Token is missing.');
  if (!psid) throw new Error('Recipient Facebook PSID is required for test alert.');

  const text = `🔔 [TEST NOTIFICATION]
━━━━━━━━━━━━━━━━
✅ Your Court Manager Meta Messenger integration is working properly!
You will receive live booking alerts directly on your Facebook profile whenever a player reserves a court.
━━━━━━━━━━━━━━━━
Timestamp: ${new Date().toLocaleTimeString()}`;

  return await sendMessengerPayload(psid, { text }, token);
}

module.exports = {
  resolveFacebookConfig,
  sendBookingAlertToAdmin,
  sendTestMessenger
};
