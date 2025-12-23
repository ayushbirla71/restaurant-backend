const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const { v4: uuidv4 } = require("uuid");

const WaitingList = sequelize.define("WaitingList", {
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
  peopleCount: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  preferredTableSize: {
    type: DataTypes.ENUM("SMALL", "MEDIUM", "LARGE"),
    allowNull: false
  },
  bookingType: {
    type: DataTypes.ENUM("WALK_IN", "PRE_BOOKING"),
    defaultValue: "WALK_IN",
    allowNull: false
  },
  bookingDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  bookingTimeSlot: {
    type: DataTypes.STRING,
    allowNull: true
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    comment: "Higher priority for pre-bookings"
  },
  status: {
    type: DataTypes.ENUM("WAITING", "NOTIFIED", "ASSIGNED", "CANCELLED"),
    defaultValue: "WAITING"
  },
  estimatedWaitMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    comment: "Estimated wait time in minutes when added to waiting list"
  },
  notifiedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

module.exports = WaitingList;

