const r = require("express").Router();
const c = require("../controllers/dashboard.controller");

r.get("/stats", c.getDashboardStats);

module.exports = r;
