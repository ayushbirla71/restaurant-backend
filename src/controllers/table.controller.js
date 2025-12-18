const { Table, Booking } = require("../models");

exports.createTable = async (req, res) => {
  const table = await Table.create(req.body);

  // Emit real-time update
  req.io.emit("tableCreated", table);
  req.io.emit("dashboardUpdated");

  res.json(table);
};

exports.getTablesByFloor = async (req, res) => {
  res.json(await Table.findAll({
    where: { floorId: req.params.floorId }
  }));
};

exports.updateTableStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const table = await Table.findByPk(req.params.id);

    if (!table) {
      return res.status(404).json({ message: "Table not found" });
    }

    // If changing table to AVAILABLE → cancel latest BOOKED booking
    if (status === "AVAILABLE" && table.status !== "AVAILABLE") {
      const booking = await Booking.findOne({
        where: {
          tableId: table.id,
          status: "BOOKED"
        },
        order: [["bookingTime", "DESC"]]
      });

      if (booking) {
        booking.status = "COMPLETED";
        await booking.save();
      }
    }

    table.status = status;
    await table.save();

    // Real-time updates
    req.io.emit("tableStatusUpdated", table);
    req.io.emit("dashboardUpdated");

    res.json(table);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.getTableBookingDetails = async (req, res) => {


  try {
    const latestBooking = await Booking.findOne({
      where: {
        tableId: req.params.id,
        status: "BOOKED"
      },
      order: [["bookingTime", "DESC"]]
    });

    // No booking found → return null
    if (!latestBooking) {
      return res.json(null);
    }

    res.json(latestBooking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

