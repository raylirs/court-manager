const bcrypt = require('bcryptjs');
const { sequelize, Court, Reservation, CourtBlock, SystemSetting, User } = require('../models');
const fs = require('fs');
const path = require('path');

async function seed() {
  console.log('--- Initializing Court Manager Database Sync & Seed ---');

  // Sync all database tables
  await sequelize.sync({ alter: true });
  console.log('✓ Database tables synchronized.');

  // Ensure public/uploads exists
  const uploadsDir = path.join(__dirname, '../public/uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // 1. Seed or update default admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@courtmanager.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPassword123!';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const [adminUser, userCreated] = await User.findOrCreate({
    where: { email: adminEmail },
    defaults: {
      name: process.env.ADMIN_NAME || 'Court Manager Admin',
      email: adminEmail,
      password_hash: hashedPassword,
      role: 'admin',
      is_active: true
    }
  });

  if (userCreated) {
    console.log(`✓ Admin user created: ${adminEmail} (password: ${adminPassword})`);
  } else {
    adminUser.password_hash = hashedPassword;
    await adminUser.save();
    console.log(`✓ Admin password updated for ${adminEmail}`);
  }

  // 2. Seed System Settings
  const defaultSettings = [
    { key: 'VENUE_NAME', value: 'The Playground Sports Arena', description: 'Facility display title' },
    { key: 'VENUE_DESCRIPTION', value: 'Premier sports courts available for hourly reservations. Features professional tournament acrylic surfaces, climate control, LED lighting, and instant GCash payment verification.', description: 'Facility summary' },
    { key: 'VENUE_ADDRESS', value: '123 Athletics Way, Fort Bonifacio, Taguig City', description: 'Facility address' },
    { key: 'VENUE_PHONE', value: '0917-800-3577', description: 'Contact phone' },
    { key: 'OPEN_TIME', value: '06:00', description: 'Daily opening time (HH:mm)' },
    { key: 'CLOSE_TIME', value: '22:00', description: 'Daily closing time (HH:mm)' },
    { key: 'SLOT_DURATION', value: '60', description: 'Booking slot duration in minutes' },
    { key: 'GCASH_ACCOUNT_NAME', value: 'RY*N KR******R L.', description: 'Merchant account name' },
    { key: 'GCASH_ACCOUNT_NUMBER', value: '0917-800-3577', description: 'Merchant GCash number' },
    { key: 'GCASH_QR_IMAGE', value: '', description: 'Uploaded QR image url' },
    { key: 'FB_NOTIFICATIONS_ENABLED', value: 'false', description: 'Toggle Messenger alerts' },
    { key: 'EMAIL_NOTIFICATIONS_ENABLED', value: 'true', description: 'Toggle Email alerts' },
    { key: 'SMTP_HOST', value: 'smtp.gmail.com', description: 'SMTP host' },
    { key: 'SMTP_PORT', value: '465', description: 'SMTP port' },
    { key: 'SMTP_FROM_NAME', value: 'The Playground Sports Arena', description: 'Email sender title' }
  ];

  for (const s of defaultSettings) {
    const existing = await SystemSetting.findByPk(s.key);
    if (!existing) {
      await SystemSetting.create(s);
    }
  }
  console.log('✓ System settings initialized.');

  // 3. Seed Sample Courts if empty
  const courtCount = await Court.count();
  if (courtCount === 0) {
    await Court.bulkCreate([
      {
        name: 'Championship Indoor Court 1',
        court_number: 1,
        surface_type: 'Indoor Acrylic (Air-conditioned)',
        price_per_hour: 600.00,
        description: 'Center court with tournament net, shock-absorbing subfloor, climate control, and spectator seating.',
        is_active: true
      },
      {
        name: 'Championship Indoor Court 2',
        court_number: 2,
        surface_type: 'Indoor Acrylic (Air-conditioned)',
        price_per_hour: 600.00,
        description: 'Pro tournament court featuring high-bay glare-free LED lighting and non-slip surface.',
        is_active: true
      },
      {
        name: 'Covered Outdoor Court 3',
        court_number: 3,
        surface_type: 'Covered Cushion Acrylic',
        price_per_hour: 450.00,
        description: 'High-ceiling covered court protected from rain and direct sun, with natural breeze ventilation.',
        is_active: true
      }
    ]);
    console.log('✓ 3 sample facility courts seeded.');
  }

  console.log('--- Seed Finished Successfully! ---');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

module.exports = seed;
