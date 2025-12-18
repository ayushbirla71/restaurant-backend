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
app.use("/api/dashboard", require("./routes/dashboard.routes"));

require("./socket")(io);
// initDB();

server.listen(process.env.PORT || 5000, () =>
  console.log("🚀 Server running on port 5000")
);
