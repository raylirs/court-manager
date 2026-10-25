const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Venue = sequelize.define('Venue', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  slug: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  address: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  contact_phone: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  contact_email: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  logo_url: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  cover_image_url: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  // Operating schedule
  open_time: {
    type: DataTypes.STRING(10),
    defaultValue: '06:00'
  },
  close_time: {
    type: DataTypes.STRING(10),
    defaultValue: '22:00'
  },
  slot_duration: {
    type: DataTypes.INTEGER,
    defaultValue: 60 // in minutes
  },
  // GCash Settings per venue
  gcash_account_name: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  gcash_account_number: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  gcash_qr_image: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  // Meta Messenger Settings per venue
  fb_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  fb_app_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  fb_app_secret: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  fb_page_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  fb_page_name: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  fb_page_token: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  fb_admin_psids: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Email / SMTP Settings per venue
  email_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  smtp_host: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  smtp_port: {
    type: DataTypes.INTEGER,
    defaultValue: 465
  },
  smtp_user: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  smtp_pass: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  smtp_from_name: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  admin_alert_email: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'venues',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Venue;
