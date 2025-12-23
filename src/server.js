require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { initDB } = require("./models");

const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use("/api/floors", require("./routes/floor.routes"));
app.use("/api/tables", require("./routes/table.routes"));
app.use("/api/bookings", require("./routes/booking.routes"));
app.use("/api/waitinglist", require("./routes/waitinglist.routes"));
app.use("/api/dashboard", require("./routes/dashboard.routes"));
app.use("/api/notifications", require("./routes/notification.routes"));

require("./socket")(io);

// Initialize database and sync schema
// initDB().then(() => {
//   console.log("✅ Database initialized and schema synced");
// }).catch((error) => {
//   console.error("❌ Database initialization failed:", error);
// });

// Auto-sync table statuses every 5 minutes
const { syncTableStatuses } = require("./controllers/booking.controller");
setInterval(async () => {
  try {
    // Create a mock request object with io
    const mockReq = { io };
    const mockRes = {
      json: () => {},
      status: () => ({ json: () => {} })
    };
    await syncTableStatuses(mockReq, mockRes);
    console.log("✅ Table statuses synced");
  } catch (error) {
    console.error("❌ Error syncing table statuses:", error.message);
  }
}, 5 * 60 * 1000); // Every 5 minutes

// Check for upcoming bookings and send notifications every minute
const { checkUpcomingBookings } = require("./controllers/notification.controller");
setInterval(async () => {
  try {
    await checkUpcomingBookings(io);
  } catch (error) {
    console.error("❌ Error checking upcoming bookings:", error.message);
  }
}, 60 * 1000); // Every minute

// Check for long waiting customers every minute
const { checkLongWaitingCustomers } = require("./controllers/waitinglist.controller");
setInterval(async () => {
  try {
    await checkLongWaitingCustomers(io);
  } catch (error) {
    console.error("❌ Error checking long waiting customers:", error.message);
  }
}, 60 * 1000); // Every minute

server.listen(process.env.PORT || 5000, () =>
  console.log("🚀 Server running on port 5000")
);
