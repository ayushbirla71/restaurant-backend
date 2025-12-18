const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const { v4: uuidv4 } = require("uuid");

const Floor = sequelize.define("Floor", {
  id: {
    type: DataTypes.UUID,
    defaultValue: uuidv4,
    primaryKey: true
  },
  floorNumber: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  name: DataTypes.STRING
});

module.exports = Floor;
