const bcrypt = require('bcryptjs');
const { sequelize, Venue, Court, Reservation, CourtBlock, SystemSetting, User } = require('../models');
const fs = require('fs');
const path = require('path');

async function seed() {
  console.log('--- Initializing Court Manager Multi-Tenant Database Sync & Seed ---');

  // Sync database with alter
  await sequelize.sync({ alter: true });
  console.log('✓ Database tables synchronized.');

  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, '../public/uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // 1. Create or Update Platform Superadmin
  const superadminEmail = process.env.ADMIN_EMAIL || 'admin@courtmanager.com';
  const superadminPass = process.env.ADMIN_PASSWORD || 'AdminPassword123!';
  const superHashed = await bcrypt.hash(superadminPass, 10);

  const [superadmin, superCreated] = await User.findOrCreate({
    where: { email: superadminEmail.trim().toLowerCase() },
    defaults: {
      name: 'Platform Superadmin',
      email: superadminEmail.trim().toLowerCase(),
      password_hash: superHashed,
      role: 'superadmin',
      venue_id: null,
      is_active: true
    }
  });

  if (!superCreated) {
    superadmin.password_hash = superHashed;
    superadmin.role = 'superadmin';
    await superadmin.save();
  }
  console.log(`✓ Superadmin user ready: ${superadminEmail}`);

  // 2. Create Sample Venue 1: The Playground Pickleball
  const [venue1] = await Venue.findOrCreate({
    where: { slug: 'the-playground' },
    defaults: {
      name: 'The Playground Pickleball',
      slug: 'the-playground',
      description: 'Championship covered arena with tournament-grade pickleball courts, player lounge, and pro shop.',
      address: '123 Athletics Blvd, Fort Bonifacio, Taguig City',
      contact_phone: '0917-800-3577',
      contact_email: 'info@theplayground.com',
      open_time: '06:00',
      close_time: '22:00',
      slot_duration: 60,
      gcash_account_name: 'THE PLAYGROUND ARENA',
      gcash_account_number: '0917-800-3577',
      email_enabled: true,
      is_active: true
    }
  });

  // Create courts for Venue 1 if none exist
  const v1Courts = await Court.count({ where: { venue_id: venue1.id } });
  if (v1Courts === 0) {
    await Court.bulkCreate([
      {
        venue_id: venue1.id,
        name: 'Court 1 - Championship Indoor',
        court_number: 1,
        surface_type: 'Indoor Acrylic',
        price_per_hour: 600.00,
        description: 'Tournament center court with shock absorption and LED lighting.',
        is_active: true
      },
      {
        venue_id: venue1.id,
        name: 'Court 2 - Championship Indoor',
        court_number: 2,
        surface_type: 'Indoor Acrylic',
        price_per_hour: 600.00,
        description: 'Tournament court with high-bay LED lighting.',
        is_active: true
      },
      {
        venue_id: venue1.id,
        name: 'Court 3 - Covered Outdoor',
        court_number: 3,
        surface_type: 'Covered Cushion Acrylic',
        price_per_hour: 450.00,
        description: 'High-ceiling covered court protected from rain and sun.',
        is_active: true
      }
    ]);
    console.log('✓ Venue 1 (The Playground) courts seeded.');
  }

  // 3. Create Sample Venue 2: Metro Smash Club
  const [venue2] = await Venue.findOrCreate({
    where: { slug: 'metro-smash' },
    defaults: {
      name: 'Metro Smash Club',
      slug: 'metro-smash',
      description: 'Premier multi-sport racket facility featuring professional cushion courts, pro shop, and cafe.',
      address: '88 Ortigas Complex, Pasig City',
      contact_phone: '0918-123-4567',
      contact_email: 'play@metrosmash.com',
      open_time: '07:00',
      close_time: '23:00',
      slot_duration: 60,
      gcash_account_name: 'METRO SMASH ARENA',
      gcash_account_number: '0918-123-4567',
      email_enabled: true,
      is_active: true
    }
  });

  // Create courts for Venue 2 if none exist
  const v2Courts = await Court.count({ where: { venue_id: venue2.id } });
  if (v2Courts === 0) {
    await Court.bulkCreate([
      {
        venue_id: venue2.id,
        name: 'Smash Arena A',
        court_number: 1,
        surface_type: 'Hardcourt Vinyl Cushion',
        price_per_hour: 500.00,
        description: 'Premium air-conditioned court.',
        is_active: true
      },
      {
        venue_id: venue2.id,
        name: 'Smash Arena B',
        court_number: 2,
        surface_type: 'Hardcourt Vinyl Cushion',
        price_per_hour: 500.00,
        description: 'Premium air-conditioned court.',
        is_active: true
      }
    ]);
    console.log('✓ Venue 2 (Metro Smash) courts seeded.');
  }

  // 4. Create Venue Admin for The Playground
  const hashPlayground = await bcrypt.hash('Playground2026!', 10);
  await User.findOrCreate({
    where: { email: 'manager@theplayground.com' },
    defaults: {
      name: 'Playground Facility Manager',
      email: 'manager@theplayground.com',
      password_hash: hashPlayground,
      role: 'venue_admin',
      venue_id: venue1.id,
      is_active: true
    }
  });

  // 5. Create Venue Admin for Metro Smash
  const hashMetro = await bcrypt.hash('MetroSmash2026!', 10);
  await User.findOrCreate({
    where: { email: 'manager@metrosmash.com' },
    defaults: {
      name: 'Metro Smash Club Admin',
      email: 'manager@metrosmash.com',
      password_hash: hashMetro,
      role: 'venue_admin',
      venue_id: venue2.id,
      is_active: true
    }
  });

  console.log('--- Multi-Tenant Seed Finished Successfully! ---');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}

module.exports = seed;
