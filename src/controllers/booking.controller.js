const { Booking, Table } = require("../models");

exports.createBooking = async (req, res) => {
  const booking = await Booking.create(req.body);

  await Table.update(
    { status: "BOOKED" },
    { where: { id: req.body.tableId } }
  );

  req.io.emit("tableStatusUpdated", {
    tableId: req.body.tableId,
    status: "BOOKED"
  });

  req.io.emit("dashboardUpdated");

  res.json(booking);
};

exports.getBookings = async (req, res) => {
  res.json(await Booking.findAll({ include: Table }));
};

exports.cancelBooking = async (req, res) => {
  const booking = await Booking.findByPk(req.params.id);
  booking.status = "CANCELLED";
  await booking.save();

  await Table.update(
    { status: "AVAILABLE" },
    { where: { id: booking.tableId } }
  );

  req.io.emit("tableStatusUpdated", {
    tableId: booking.tableId,
    status: "AVAILABLE"
  });

  req.io.emit("dashboardUpdated");

  res.json(booking);
};

exports.completeBooking = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    booking.status = "COMPLETED";
    await booking.save();

    await Table.update(
      { status: "AVAILABLE" },
      { where: { id: booking.tableId } }
    );

    req.io.emit("tableStatusUpdated", {
      tableId: booking.tableId,
      status: "AVAILABLE"
    });

    req.io.emit("dashboardUpdated");

    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.reassignTable = async (req, res) => {
  try {
    const { newTableId } = req.body;
    const booking = await Booking.findByPk(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const oldTableId = booking.tableId;

    // Check if new table is available
    const newTable = await Table.findByPk(newTableId);
    if (!newTable) {
      return res.status(404).json({ message: "New table not found" });
    }

    if (newTable.status !== "AVAILABLE") {
      return res.status(400).json({ message: "New table is not available" });
    }

    // Update booking with new table
    booking.tableId = newTableId;
    await booking.save();

    // Update old table to available
    await Table.update(
      { status: "AVAILABLE" },
      { where: { id: oldTableId } }
    );

    // Update new table to booked
    await Table.update(
      { status: "BOOKED" },
      { where: { id: newTableId } }
    );

    // Emit real-time updates
    req.io.emit("tableStatusUpdated", { tableId: oldTableId, status: "AVAILABLE" });
    req.io.emit("tableStatusUpdated", { tableId: newTableId, status: "BOOKED" });
    req.io.emit("bookingUpdated", booking);
    req.io.emit("dashboardUpdated");

    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
