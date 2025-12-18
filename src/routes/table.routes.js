const r = require("express").Router();
const c = require("../controllers/table.controller");

r.post("/", c.createTable);
r.get("/floor/:floorId", c.getTablesByFloor);
r.put("/:id/status", c.updateTableStatus);
r.get("/:id/booking", c.getTableBookingDetails)

module.exports = r;
