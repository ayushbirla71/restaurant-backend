const r = require("express").Router();
const c = require("../controllers/booking.controller");

r.post("/", c.createBooking);
r.post("/override", c.overrideBooking);
r.get("/", c.getBookings);
r.get("/available", c.getAvailableTables);
r.get("/by-date", c.getBookingsByDate);
r.post("/table/:tableId/upcoming", c.getUpcomingBookingsForTable);
r.post("/sync-statuses", c.syncTableStatuses);
r.put("/:id/cancel", c.cancelBooking);
r.get("/:id", c.getBooking);
r.put("/:id/edit", c.updateBooking);
r.put("/:id/complete", c.completeBooking);
r.put("/:id/reassign", c.reassignTable);
r.delete("/:id", c.deleteBooking);

module.exports = r;
