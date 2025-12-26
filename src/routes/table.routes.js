const r = require("express").Router();
const c = require("../controllers/table.controller");

r.post("/", c.createTable);
r.delete("/:id", c.deleteTable);
r.get("/floor/:floorId", c.getTablesByFloor);
r.get("/statuses-for-datetime", c.getTableStatusesForDateTime); // Must be before /:id routes
r.put("/:id/status", c.updateTableStatus);
r.put("/:id/availability", c.updateTableAvailability);
r.get("/:id/booking", c.getTableBookingDetails);
r.get("/:id/bookings/all", c.getAllTableBookings);

module.exports = r;
