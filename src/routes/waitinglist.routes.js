const r = require("express").Router();
const c = require("../controllers/waitinglist.controller");

r.post("/", c.addToWaitingList);
r.get("/", c.getWaitingList);
r.post("/:waitingId/check-conflict", c.checkAssignConflict);
r.post("/:waitingId/assign", c.assignTableFromWaiting);
r.put("/:waitingId/cancel", c.cancelWaitingEntry);
r.put("/:waitingId/notify", c.notifyCustomer);

module.exports = r;

