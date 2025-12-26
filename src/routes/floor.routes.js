const r = require("express").Router();
const c = require("../controllers/floor.controller");

r.post("/", c.createFloor);
r.delete("/:id", c.deleteFloor);
r.get("/with-tables", c.getFloorsWithTables);
r.get("/", c.getFloors);

module.exports = r;
