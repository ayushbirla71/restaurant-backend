const r = require("express").Router();
const c = require("../controllers/notification.controller");

r.get("/pending", c.getPendingNotifications);
r.put("/:id/confirm", c.confirmBooking);
r.put("/:id/delay", c.markClientDelayed);

module.exports = r;

