const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Reservation = sequelize.define('Reservation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  venue_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'venues',
      key: 'id'
    }
  },
  reference_code: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true
  },
  court_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'courts',
      key: 'id'
    }
  },
  booking_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  start_time: {
    type: DataTypes.STRING(10),
    allowNull: false
  },
  end_time: {
    type: DataTypes.STRING(10),
    allowNull: false
  },
  duration_hours: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 1
  },
  total_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  player_name: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  player_email: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  player_phone: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  payment_method: {
    type: DataTypes.STRING(50),
    defaultValue: 'gcash'
  },
  payment_status: {
    type: DataTypes.ENUM('pending_payment', 'confirmed', 'cancelled', 'completed'),
    defaultValue: 'pending_payment'
  },
  gcash_reference_no: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  payment_proof_image: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  admin_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'reservations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Reservation;
