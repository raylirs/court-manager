const sequelize = require('../config/database');
const Venue = require('./Venue');
const Court = require('./Court');
const CourtBlock = require('./CourtBlock');
const Reservation = require('./Reservation');
const SystemSetting = require('./SystemSetting');
const User = require('./User');

// Venue -> Court (1:N)
Venue.hasMany(Court, { foreignKey: 'venue_id', as: 'courts', onDelete: 'CASCADE' });
Court.belongsTo(Venue, { foreignKey: 'venue_id', as: 'venue' });

// Venue -> Reservation (1:N)
Venue.hasMany(Reservation, { foreignKey: 'venue_id', as: 'reservations', onDelete: 'CASCADE' });
Reservation.belongsTo(Venue, { foreignKey: 'venue_id', as: 'venue' });

// Venue -> CourtBlock (1:N)
Venue.hasMany(CourtBlock, { foreignKey: 'venue_id', as: 'blocks', onDelete: 'CASCADE' });
CourtBlock.belongsTo(Venue, { foreignKey: 'venue_id', as: 'venue' });

// Venue -> User (1:N)
Venue.hasMany(User, { foreignKey: 'venue_id', as: 'managers', onDelete: 'CASCADE' });
User.belongsTo(Venue, { foreignKey: 'venue_id', as: 'venue' });

// Court -> Reservation (1:N)
Court.hasMany(Reservation, { foreignKey: 'court_id', as: 'reservations', onDelete: 'CASCADE' });
Reservation.belongsTo(Court, { foreignKey: 'court_id', as: 'court' });

// Court -> CourtBlock (1:N)
Court.hasMany(CourtBlock, { foreignKey: 'court_id', as: 'blocks', onDelete: 'CASCADE' });
CourtBlock.belongsTo(Court, { foreignKey: 'court_id', as: 'court' });

module.exports = {
  sequelize,
  Venue,
  Court,
  CourtBlock,
  Reservation,
  SystemSetting,
  User
};
