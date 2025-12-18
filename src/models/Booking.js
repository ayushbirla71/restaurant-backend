const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const { v4: uuidv4 } = require("uuid");

const Booking = sequelize.define("Booking", {
  id: {
    type: DataTypes.UUID,
    defaultValue: uuidv4,
    primaryKey: true
  },
  customerName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  mobile: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: DataTypes.STRING,
  peopleCount: DataTypes.INTEGER,
  bookingTime: DataTypes.DATE,
  durationMinutes: {
    type: DataTypes.INTEGER,
    defaultValue: 60,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM("BOOKED", "CANCELLED", "COMPLETED"),
    defaultValue: "BOOKED"
  }
});

module.exports = Booking;
