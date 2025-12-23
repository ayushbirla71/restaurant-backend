const r = require("express").Router();
const c = require("../controllers/booking.controller");

r.post("/", c.createBooking);
r.post("/override", c.overrideBooking);
r.get("/", c.getBookings);
r.get("/available", c.getAvailableTables);
r.get("/by-date", c.getBookingsByDate);
r.get("/table/:tableId/upcoming", c.getUpcomingBookingsForTable);
r.post("/sync-statuses", c.syncTableStatuses);
r.put("/:id/cancel", c.cancelBooking);
r.put("/:id/complete", c.completeBooking);
r.put("/:id/reassign", c.reassignTable);

module.exports = r;
