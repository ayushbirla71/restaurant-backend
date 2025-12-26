const { Table, Booking } = require("../models");

// Helper function to check if booking is active (within 30 min window)
const isBookingActive = (bookingTime, bookingDate, bookingType) => {
  const now = new Date();
  let bookingDateTime;

  // Walk-in bookings are ALWAYS active immediately
  if (bookingType === "WALK_IN") {
    return true;
  }

  if (bookingDate) {
    // Pre-booking with specific date
    const dateStr = bookingDate;
    const timeStr = bookingTime || "00:00";
    bookingDateTime = new Date(`${dateStr}T${timeStr}`);
  } else {
    // Walk-in booking (use bookingTime as full datetime)
    bookingDateTime = new Date(bookingTime);
  }

  const timeDiffMs = bookingDateTime.getTime() - now.getTime();
  const timeDiffMinutes = timeDiffMs / (1000 * 60);

  // Booking is active if it's within 30 minutes before or after the booking time
  return timeDiffMinutes >= -30 && timeDiffMinutes <= 30;
};

exports.createTable = async (req, res) => {
  // Automatically set seats based on size if not provided
  if (!req.body.seats && req.body.size) {
    const sizeToSeats = {
      "SMALL": 2,
      "MEDIUM": 4,
      "LARGE": 6
    };
    req.body.seats = sizeToSeats[req.body.size] || 2;
  }

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

    // If changing table to AVAILABLE → complete CURRENT active booking only
    if (status === "AVAILABLE" && table.status !== "AVAILABLE") {
      // Get ALL BOOKED bookings for this table
      const allBookings = await Booking.findAll({
        where: {
          tableId: table.id,
          status: "BOOKED"
        },
        order: [["bookingTime", "ASC"]] // Sort by time
      });

      // Find the CURRENT active booking (within 30-min window)
      const currentBooking = allBookings.find(b =>
        isBookingActive(b.bookingTime, b.bookingDate, b.bookingType)
      );

      // Only complete the CURRENT active booking, leave future bookings untouched
      if (currentBooking) {
        currentBooking.status = "COMPLETED";
        await currentBooking.save();
      }
    }

    table.status = status;

    // ONLY set occupiedSince when marking as OCCUPIED (customer actually seated)
    if (status === "OCCUPIED") {
      table.occupiedSince = new Date(); // Start timer when customer sits
    }

    // Clear occupiedSince when table becomes AVAILABLE or BOOKED
    if (status === "AVAILABLE" || status === "BOOKED") {
      table.occupiedSince = null; // Clear timer (not occupied yet)
      if (status === "AVAILABLE") {
        table.availableInMinutes = null; // Clear staff-set availability time
      }
    }

    await table.save();

    // Real-time updates
    req.io.emit("tableStatusUpdated", table);
    req.io.emit("dashboardUpdated");

    res.json(table);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get table statuses for a specific date/time (for pre-booking form)
exports.getTableStatusesForDateTime = async (req, res) => {
  try {
    const { bookingDate, bookingTimeSlot } = req.query;

    if (!bookingDate || !bookingTimeSlot) {
      return res.status(400).json({ message: "bookingDate and bookingTimeSlot are required" });
    }

    const { Op } = require("sequelize");
    const Floor = require("../models").Floor;

    // Get all floors with tables
    const floors = await Floor.findAll({
      include: [{
        model: Table,
        as: "Tables"
      }],
      order: [
        ["floorNumber", "ASC"],
        [{ model: Table, as: "Tables" }, "tableNumber", "ASC"]
      ]
    });

    // For each table, check if it has a booking at the specified date/time
    const floorsWithStatus = await Promise.all(floors.map(async (floor) => {
      const tablesWithStatus = await Promise.all(floor.Tables.map(async (table) => {
        // Check if table has a booking for this date/time
        const booking = await Booking.findOne({
          where: {
            tableId: table.id,
            bookingDate: bookingDate,
            bookingTimeSlot: bookingTimeSlot,
            status: {
              [Op.in]: ["BOOKED", "CONFIRMED"]
            }
          }
        });

        // Return table with virtual status for this date/time
        return {
          ...table.toJSON(),
          statusForDateTime: booking ? "BOOKED" : "AVAILABLE",
          bookingForDateTime: booking ? {
            id: booking.id,
            customerName: booking.customerName,
            peopleCount: booking.peopleCount,
            durationMinutes: booking.durationMinutes
          } : null
        };
      }));

      return {
        ...floor.toJSON(),
        Tables: tablesWithStatus
      };
    }));

    res.json(floorsWithStatus);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTableBookingDetails = async (req, res) => {
  try {
    // Get all active bookings for this table (BOOKED status)
    const allBookings = await Booking.findAll({
      where: {
        tableId: req.params.id,
        status: "BOOKED"
      },
      order: [["bookingTime", "ASC"]] // Order by time ASCENDING (earliest first)
    });

    // No bookings found → return null
    if (!allBookings || allBookings.length === 0) {
      return res.json(null);
    }

    const now = new Date();

    // Find the FIRST active booking (earliest booking that is currently active)
    for (const booking of allBookings) {
      let bookingDateTime;

      if (booking.bookingDate && booking.bookingTimeSlot) {
        // Pre-booking with specific date and time
        bookingDateTime = new Date(`${booking.bookingDate}T${booking.bookingTimeSlot}`);
      } else {
        // Walk-in booking
        bookingDateTime = new Date(booking.bookingTime);
      }

      const timeDiff = bookingDateTime.getTime() - now.getTime();
      const minutesUntilBooking = Math.floor(timeDiff / 60000);

      // Return the FIRST booking that is within 30 minutes or already started
      // This is the "active/current" booking
      if (minutesUntilBooking <= 45) {
        return res.json(booking);
      }
    }

    // No active booking found (all bookings are in the future)
    return res.json(null);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all bookings for a table (TODAY ONLY - within 24 hours)
exports.getAllTableBookings = async (req, res) => {
  try {
    const { Op } = require("sequelize");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayStr = today.toISOString().split('T')[0];

    // Get all bookings for this table TODAY ONLY (not cancelled/completed)
    // Include: today's walk-ins and today's pre-bookings ONLY
    const bookings = await Booking.findAll({
      where: {
        tableId: req.params.id,
        status: { [Op.notIn]: ["CANCELLED", "COMPLETED"] },
        [Op.or]: [
          // Walk-in bookings created today
          {
            bookingType: "WALK_IN",
            createdAt: {
              [Op.gte]: today,
              [Op.lt]: tomorrow
            }
          },
          // Pre-bookings scheduled for TODAY ONLY (not future dates)
          {
            bookingType: "PRE_BOOKING",
            bookingDate: todayStr // Only today's date
          }
        ]
      },
      order: [
        ["bookingDate", "ASC"],
        ["bookingTimeSlot", "ASC"],
        ["bookingTime", "ASC"]
      ]
    });

    res.json(bookings);
  } catch (error) {
    res.json({ message: error.message });
  }
};

// Update table availability time (staff feature)
exports.updateTableAvailability = async (req, res) => {
  try {
    const { availableInMinutes } = req.body;

    const table = await Table.findByPk(req.params.id);

    if (!table) {
      return res.status(404).json({ message: "Table not found" });
    }

    table.availableInMinutes = availableInMinutes;
    await table.save();

    // Emit real-time update
    req.io.emit("tableAvailabilityUpdated", {
      tableId: table.id,
      availableInMinutes
    });
    req.io.emit("dashboardUpdated");

    res.json(table);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.deleteTable = async (req, res) => {
  try {
    await Table.destroy({
      where: { id: req.params.id }
    });

    // Emit real-time update
    req.io.emit("tableDeleted", req.params.id);
    req.io.emit("dashboardUpdated");

    res.json({ message: "Table deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
