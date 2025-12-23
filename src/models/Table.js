const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const { v4: uuidv4 } = require("uuid");

const Table = sequelize.define("Table", {
  id: {
    type: DataTypes.UUID,
    defaultValue: uuidv4,
    primaryKey: true
  },
  tableNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  size: {
    type: DataTypes.ENUM("SMALL", "MEDIUM", "LARGE"),
    allowNull: false
  },
  seats: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2,
    comment: "Number of seats at this table"
  },
  status: {
    type: DataTypes.ENUM("AVAILABLE", "BOOKED", "OCCUPIED"),
    defaultValue: "AVAILABLE"
  },
  occupiedSince: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
    comment: "Timestamp when table became BOOKED or OCCUPIED"
  },
  availableInMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    comment: "Estimated minutes until table becomes available"
  }
});

module.exports = Table;
