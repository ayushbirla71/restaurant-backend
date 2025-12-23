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
  bookingDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  bookingTimeSlot: {
    type: DataTypes.STRING,
    allowNull: true
  },
  durationMinutes: {
    type: DataTypes.INTEGER,
    defaultValue: 60,
    allowNull: false
  },
  bookingType: {
    type: DataTypes.ENUM("WALK_IN", "PRE_BOOKING"),
    defaultValue: "WALK_IN",
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM("BOOKED", "CANCELLED", "COMPLETED", "WAITING", "CONFIRMED"),
    defaultValue: "BOOKED"
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    comment: "Higher priority for pre-bookings"
  },
  confirmationStatus: {
    type: DataTypes.ENUM("PENDING", "CONFIRMED", "CLIENT_DELAYED", "CANCELLED"),
    defaultValue: "PENDING",
    allowNull: false,
    comment: "Confirmation status for pre-bookings"
  },
  confirmedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: "Timestamp when booking was confirmed"
  },
  delayMinutes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    comment: "Minutes client is delayed (if CLIENT_DELAYED)"
  },
  notificationsSent: {
    type: DataTypes.JSON,
    defaultValue: [],
    allowNull: false,
    comment: "Array of notification timestamps sent (30min, 20min, 10min, 5min)"
  }
});

module.exports = Booking;
