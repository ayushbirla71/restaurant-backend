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
  status: {
    type: DataTypes.ENUM("AVAILABLE", "BOOKED", "OCCUPIED"),
    defaultValue: "AVAILABLE"
  }
});

module.exports = Table;
