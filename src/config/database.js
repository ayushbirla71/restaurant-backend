const { Sequelize } = require("sequelize");

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "./restaurant.sqlite",
  logging: false
});

module.exports = sequelize;
