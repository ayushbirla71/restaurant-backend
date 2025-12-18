const r = require("express").Router();
const c = require("../controllers/booking.controller");

r.post("/", c.createBooking);
r.get("/", c.getBookings);
r.put("/:id/cancel", c.cancelBooking);
r.put("/:id/complete", c.completeBooking);
r.put("/:id/reassign", c.reassignTable);

module.exports = r;
