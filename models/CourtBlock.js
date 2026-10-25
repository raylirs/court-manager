const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CourtBlock = sequelize.define('CourtBlock', {
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
  court_id: {
    type: DataTypes.INTEGER,
    allowNull: true, // null means all courts in this venue
    references: {
      model: 'courts',
      key: 'id'
    }
  },
  block_date: {
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
  reason: {
    type: DataTypes.STRING(255),
    defaultValue: 'Court Maintenance / Private Event'
  }
}, {
  tableName: 'court_blocks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = CourtBlock;
