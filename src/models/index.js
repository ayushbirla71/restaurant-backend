const sequelize = require("../config/database");
const Floor = require("./Floor");
const Table = require("./Table");
const Booking = require("./Booking");

Floor.hasMany(Table, { foreignKey: "floorId" });
Table.belongsTo(Floor, { foreignKey: "floorId" });

Table.hasMany(Booking, { foreignKey: "tableId" });
Booking.belongsTo(Table, { foreignKey: "tableId" });

const initDB = async () => {
  await sequelize.sync({ alter: true });
  console.log("✅ Database synced");
};

module.exports = { sequelize, Floor, Table, Booking, initDB };
