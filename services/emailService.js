const nodemailer = require('nodemailer');
const { SystemSetting } = require('../models');
const { formatCurrency, formatTime12, formatDateDisplay } = require('../utils/dateTimeUtils');

async function resolveEmailConfig(venue = null) {
  // If venue has specific SMTP configured, prioritize venue settings
  if (venue && venue.smtp_user && venue.smtp_pass) {
    return {
      host: venue.smtp_host || 'smtp.gmail.com',
      port: venue.smtp_port || 465,
      user: venue.smtp_user,
      pass: venue.smtp_pass,
      fromName: venue.smtp_from_name || venue.name,
      fromEmail: venue.contact_email || venue.smtp_user,
      enabled: venue.email_enabled !== false,
      isConfigured: true,
      adminAlertEmail: venue.admin_alert_email || venue.contact_email || venue.smtp_user
    };
  }

  // Fallback to system-level settings
  const dbSettings = {};
  try {
    const rows = await SystemSetting.findAll({
      where: {
        key: [
          'SMTP_HOST',
          'SMTP_PORT',
          'SMTP_USER',
          'SMTP_PASS',
          'SMTP_FROM_NAME',
          'SMTP_FROM_EMAIL',
          'EMAIL_NOTIFICATIONS_ENABLED',
          'ADMIN_ALERT_EMAIL'
        ]
      }
    });
    rows.forEach(r => {
      if (r.value && String(r.value).trim()) {
        dbSettings[r.key] = String(r.value).trim();
      }
    });
  } catch (err) {
    console.error('Error fetching system email settings:', err.message);
  }

  const host = dbSettings.SMTP_HOST || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(dbSettings.SMTP_PORT || process.env.SMTP_PORT || '465', 10);
  const user = dbSettings.SMTP_USER || process.env.SMTP_USER || '';
  const pass = dbSettings.SMTP_PASS || process.env.SMTP_PASS || '';
  const fromName = (venue ? venue.name : null) || dbSettings.SMTP_FROM_NAME || 'Court Manager';
  const fromEmail = dbSettings.SMTP_FROM_EMAIL || user || 'no-reply@courtmanager.com';
  const enabled = dbSettings.EMAIL_NOTIFICATIONS_ENABLED !== 'false';
  const adminAlertEmail = (venue ? venue.admin_alert_email : null) || dbSettings.ADMIN_ALERT_EMAIL || user || '';

  const isConfigured = Boolean(user && pass && user !== 'mock_user');

  return { host, port, user, pass, fromName, fromEmail, enabled, isConfigured, adminAlertEmail };
}

function createTransporter(cfg) {
  if (!cfg.isConfigured) return null;
  const isSecure = cfg.port === 465;
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: isSecure,
    auth: {
      user: cfg.user,
      pass: cfg.pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

// Sends booking confirmation to player
async function sendBookingConfirmation(reservation, court, venue = null) {
  const cfg = await resolveEmailConfig(venue);
  if (!cfg.enabled || !cfg.isConfigured || !reservation.player_email) {
    return { success: false, reason: 'Email not configured' };
  }

  const transporter = createTransporter(cfg);
  if (!transporter) return { success: false };

  const venueDisplayName = venue ? venue.name : cfg.fromName;

  const html = `
    <div style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
      <div style="background: linear-gradient(135deg, #166534, #287938); padding: 32px 24px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">${venueDisplayName}</h1>
        <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">Court Booking Confirmation</p>
      </div>

      <div style="padding: 28px 24px;">
        <p style="font-size: 16px; color: #0f172a; margin-top: 0;">Hi <strong>${reservation.player_name}</strong>,</p>
        <p style="font-size: 14px; color: #475569; line-height: 1.6;">Thank you for reserving a court at <strong>${venueDisplayName}</strong>! Your booking details:</p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <span style="font-size: 13px; color: #64748b; font-weight: 600;">Reference Code:</span>
            <span style="font-family: monospace; font-weight: 700; font-size: 15px; color: #166534; background: #dcfce7; padding: 2px 8px; border-radius: 6px;">${reservation.reference_code}</span>
          </div>
          <div style="margin-bottom: 8px; font-size: 14px; color: #1e293b;">
            <strong>Court:</strong> ${court ? court.name : 'Court #' + reservation.court_id}
          </div>
          <div style="margin-bottom: 8px; font-size: 14px; color: #1e293b;">
            <strong>Date:</strong> ${formatDateDisplay(reservation.booking_date)}
          </div>
          <div style="margin-bottom: 8px; font-size: 14px; color: #1e293b;">
            <strong>Time:</strong> ${formatTime12(reservation.start_time)} - ${formatTime12(reservation.end_time)} (${reservation.duration_hours} hr)
          </div>
          <div style="margin-bottom: 8px; font-size: 14px; color: #1e293b;">
            <strong>Total Amount:</strong> <span style="font-weight: 700; color: #0f172a;">${formatCurrency(reservation.total_price)}</span>
          </div>
          <div style="font-size: 14px; color: #1e293b;">
            <strong>Payment Status:</strong> <span style="font-weight: 700; text-transform: uppercase;">${reservation.payment_status.replace('_', ' ')}</span>
          </div>
        </div>

        <p style="font-size: 13px; color: #64748b; line-height: 1.5;">Please arrive 10-15 minutes prior to your reserved slot. Present your reference code at the reception counter.</p>
      </div>

      <div style="background: #f1f5f9; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
        &copy; ${new Date().getFullYear()} ${venueDisplayName}. Powered by Court Manager Pro.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${venueDisplayName}" <${cfg.fromEmail}>`,
      to: reservation.player_email,
      subject: `Booking Confirmed: ${reservation.reference_code} - ${venueDisplayName}`,
      html: html
    });
    return { success: true };
  } catch (err) {
    console.error('[EmailService] Confirmation email error:', err.message);
    return { success: false, error: err.message };
  }
}

// Sends alert to Venue Admin when a new booking arrives
async function sendAdminNewBookingAlert(reservation, court, venue = null) {
  const cfg = await resolveEmailConfig(venue);
  if (!cfg.enabled || !cfg.isConfigured || !cfg.adminAlertEmail) return;

  const transporter = createTransporter(cfg);
  if (!transporter) return;

  const venueDisplayName = venue ? venue.name : 'Court Manager';

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #cbd5e1; border-radius: 12px;">
      <h2 style="color: #166534; margin-top: 0;">🎾 [${venueDisplayName}] New Booking!</h2>
      <p>A new reservation was placed for your venue:</p>
      <ul>
        <li><strong>Ref:</strong> ${reservation.reference_code}</li>
        <li><strong>Player:</strong> ${reservation.player_name} (${reservation.player_phone}, ${reservation.player_email})</li>
        <li><strong>Court:</strong> ${court ? court.name : 'Court'}</li>
        <li><strong>Date & Time:</strong> ${reservation.booking_date} from ${formatTime12(reservation.start_time)} to ${formatTime12(reservation.end_time)}</li>
        <li><strong>Amount:</strong> ${formatCurrency(reservation.total_price)}</li>
        <li><strong>GCash Ref:</strong> ${reservation.gcash_reference_no || 'N/A'}</li>
      </ul>
      <p><a href="/admin/reservations" style="background: #287938; color: #fff; padding: 8px 16px; text-decoration: none; border-radius: 6px; display: inline-block;">View in Admin Console</a></p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${venueDisplayName} Alerts" <${cfg.fromEmail}>`,
      to: cfg.adminAlertEmail,
      subject: `🚨 [${venueDisplayName}] New Reservation: ${reservation.player_name} (${reservation.reference_code})`,
      html: html
    });
  } catch (err) {
    console.error('[EmailService] Admin alert email error:', err.message);
  }
}

async function sendTestEmail(targetEmail, venue = null) {
  const cfg = await resolveEmailConfig(venue);
  if (!cfg.isConfigured) {
    throw new Error('SMTP credentials are not configured.');
  }

  const transporter = createTransporter(cfg);
  if (!transporter) throw new Error('Could not initialize mail transporter.');

  await transporter.verify();

  return await transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
    to: targetEmail,
    subject: `SMTP Test Ping from ${cfg.fromName}`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 2px solid #287938; border-radius: 12px; background: #f0fdf4;">
        <h3 style="color: #166534; margin: 0 0 10px 0;">✅ SMTP Connection Successful!</h3>
        <p style="color: #334155; font-size: 14px;">Your mail configuration is properly set up and ready to send court reservation receipts to players.</p>
        <p style="color: #64748b; font-size: 12px; margin-top: 16px;">Timestamp: ${new Date().toLocaleString()}</p>
      </div>
    `
  });
}

module.exports = {
  resolveEmailConfig,
  sendBookingConfirmation,
  sendAdminNewBookingAlert,
  sendTestEmail
};
