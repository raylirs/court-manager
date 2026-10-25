const sequelize = require('../config/database');
const Court = require('./Court');
const CourtBlock = require('./CourtBlock');
const Reservation = require('./Reservation');
const SystemSetting = require('./SystemSetting');
const User = require('./User');

// Court -> Reservation (1:N)
Court.hasMany(Reservation, {
  foreignKey: 'court_id',
  as: 'reservations',
  onDelete: 'CASCADE'
});
Reservation.belongsTo(Court, {
  foreignKey: 'court_id',
  as: 'court'
});

// Court -> CourtBlock (1:N)
Court.hasMany(CourtBlock, {
  foreignKey: 'court_id',
  as: 'blocks',
  onDelete: 'CASCADE'
});
CourtBlock.belongsTo(Court, {
  foreignKey: 'court_id',
  as: 'court'
});

module.exports = {
  sequelize,
  Court,
  CourtBlock,
  Reservation,
  SystemSetting,
  User
};
