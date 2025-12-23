const { WaitingList, Table, Booking } = require("../models");
const { Op } = require("sequelize");

// Add customer to waiting list
exports.addToWaitingList = async (req, res) => {
  try {
    const { customerName, mobile, email, peopleCount, preferredTableSize, bookingType, bookingDate, bookingTimeSlot, estimatedWaitMinutes } = req.body;

    // Set priority: pre-bookings get higher priority
    const priority = bookingType === "PRE_BOOKING" ? 10 : 0;

    const waitingEntry = await WaitingList.create({
      customerName,
      mobile,
      email,
      peopleCount,
      preferredTableSize,
      bookingType,
      bookingDate,
      bookingTimeSlot,
      priority,
      estimatedWaitMinutes: estimatedWaitMinutes || null,
      status: "WAITING"
    });

    // Emit real-time update
    req.io.emit("waitingListUpdated");
    req.io.emit("dashboardUpdated");

    res.json(waitingEntry);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all waiting list entries
exports.getWaitingList = async (req, res) => {
  try {
    const { date } = req.query;
    
    let whereClause = {
      status: { [Op.in]: ["WAITING", "NOTIFIED"] }
    };

    if (date) {
      whereClause.bookingDate = date;
    }

    const waitingList = await WaitingList.findAll({
      where: whereClause,
      order: [
        ["priority", "DESC"],
        ["createdAt", "ASC"]
      ]
    });

    res.json(waitingList);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Check for booking conflict when assigning table
exports.checkAssignConflict = async (req, res) => {
  try {
    const { waitingId } = req.params;
    const { tableId, durationMinutes } = req.body;

    const waitingEntry = await WaitingList.findByPk(waitingId);
    if (!waitingEntry) {
      return res.status(404).json({ message: "Waiting list entry not found" });
    }

    // Calculate booking time
    let bookingTime;
    if (waitingEntry.bookingDate && waitingEntry.bookingTimeSlot) {
      bookingTime = new Date(`${waitingEntry.bookingDate}T${waitingEntry.bookingTimeSlot}`).toISOString();
    } else {
      bookingTime = new Date().toISOString();
    }

    // Check for conflicts
    const { checkBookingConflict } = require("./booking.controller");
    const conflict = await checkBookingConflict(
      tableId,
      bookingTime,
      waitingEntry.bookingDate,
      waitingEntry.bookingTimeSlot,
      durationMinutes || 60
    );

    if (conflict) {
      // Calculate when the conflicting booking ends
      let conflictEndTime;
      if (conflict.bookingDate && conflict.bookingTimeSlot) {
        const conflictStart = new Date(`${conflict.bookingDate}T${conflict.bookingTimeSlot}`);
        conflictEndTime = new Date(conflictStart.getTime() + (conflict.durationMinutes || 60) * 60000);
      } else {
        const conflictStart = new Date(conflict.bookingTime);
        conflictEndTime = new Date(conflictStart.getTime() + (conflict.durationMinutes || 60) * 60000);
      }

      // Calculate new booking time (after conflict + 5 min buffer)
      const newBookingTime = new Date(conflictEndTime.getTime() + 5 * 60000);

      return res.json({
        hasConflict: true,
        conflict: {
          customerName: conflict.customerName,
          bookingTime: conflict.bookingTime,
          bookingDate: conflict.bookingDate,
          bookingTimeSlot: conflict.bookingTimeSlot,
          durationMinutes: conflict.durationMinutes,
          endTime: conflictEndTime.toISOString()
        },
        suggestedTime: newBookingTime.toISOString(),
        suggestedTimeSlot: `${String(newBookingTime.getHours()).padStart(2, '0')}:${String(newBookingTime.getMinutes()).padStart(2, '0')}`
      });
    }

    return res.json({ hasConflict: false });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Assign table to waiting customer
exports.assignTableFromWaiting = async (req, res) => {
  try {
    const { waitingId } = req.params;
    const { tableId, durationMinutes, autoSchedule } = req.body;

    const waitingEntry = await WaitingList.findByPk(waitingId);
    if (!waitingEntry) {
      return res.status(404).json({ message: "Waiting list entry not found" });
    }

    // Check if table exists
    const table = await Table.findByPk(tableId);
    if (!table) {
      return res.status(404).json({ message: "Table not found" });
    }

    // Create booking
    // Use the original booking date/time if it's a pre-booking, otherwise use current time
    let bookingTime;
    let bookingDate = waitingEntry.bookingDate;
    let bookingTimeSlot = waitingEntry.bookingTimeSlot;

    if (autoSchedule && req.body.suggestedTime) {
      // If auto-scheduling after conflict, use suggested time
      bookingTime = req.body.suggestedTime;

      // Update bookingTimeSlot and bookingDate for the new suggested time
      // This applies to both pre-bookings AND walk-ins
      const newTime = new Date(req.body.suggestedTime);
      bookingTimeSlot = `${String(newTime.getHours()).padStart(2, '0')}:${String(newTime.getMinutes()).padStart(2, '0')}`;
      bookingDate = newTime.toISOString().split('T')[0];
    } else if (waitingEntry.bookingDate && waitingEntry.bookingTimeSlot) {
      // For pre-bookings, preserve the original booking time
      bookingTime = new Date(`${waitingEntry.bookingDate}T${waitingEntry.bookingTimeSlot}`).toISOString();
    } else {
      // For walk-ins, use current time
      bookingTime = new Date().toISOString();
    }

    const booking = await Booking.create({
      tableId,
      customerName: waitingEntry.customerName,
      mobile: waitingEntry.mobile,
      email: waitingEntry.email,
      peopleCount: waitingEntry.peopleCount,
      bookingTime: bookingTime,
      bookingDate: bookingDate,
      bookingTimeSlot: bookingTimeSlot,
      bookingType: waitingEntry.bookingType,
      durationMinutes: durationMinutes || 60,
      status: "BOOKED",
      priority: waitingEntry.priority
    });

    // Update table status (only if not OCCUPIED)
    // table variable already exists from line 139

    // Only change to BOOKED if table is AVAILABLE (not if OCCUPIED)
    if (table.status === "AVAILABLE") {
      await Table.update(
        { status: "BOOKED" },
        { where: { id: tableId } }
      );

      // Emit table status update only if changed
      req.io.emit("tableStatusUpdated", { tableId, status: "BOOKED" });
    }
    // If table is OCCUPIED, don't change status - booking is queued

    // Update waiting list entry
    waitingEntry.status = "ASSIGNED";
    await waitingEntry.save();

    // Emit real-time updates
    req.io.emit("waitingListUpdated");
    req.io.emit("bookingCreated", booking);
    req.io.emit("dashboardUpdated");

    res.json({ booking, waitingEntry });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cancel waiting list entry
exports.cancelWaitingEntry = async (req, res) => {
  try {
    const { waitingId } = req.params;

    const waitingEntry = await WaitingList.findByPk(waitingId);
    if (!waitingEntry) {
      return res.status(404).json({ message: "Waiting list entry not found" });
    }

    waitingEntry.status = "CANCELLED";
    await waitingEntry.save();

    req.io.emit("waitingListUpdated");
    req.io.emit("dashboardUpdated");

    res.json(waitingEntry);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Notify customer (mark as notified)
exports.notifyCustomer = async (req, res) => {
  try {
    const { waitingId } = req.params;

    const waitingEntry = await WaitingList.findByPk(waitingId);
    if (!waitingEntry) {
      return res.status(404).json({ message: "Waiting list entry not found" });
    }

    waitingEntry.status = "NOTIFIED";
    waitingEntry.notifiedAt = new Date();
    await waitingEntry.save();

    req.io.emit("waitingListUpdated");

    res.json(waitingEntry);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Check for long waiting customers and send notifications
exports.checkLongWaitingCustomers = async (io) => {
  try {
    const now = new Date();

    // Get all waiting customers
    const waitingEntries = await WaitingList.findAll({
      where: {
        status: { [Op.in]: ["WAITING", "NOTIFIED"] }
      },
      order: [["createdAt", "ASC"]]
    });

    for (const entry of waitingEntries) {
      const waitingMinutes = Math.floor((now - new Date(entry.createdAt)) / (1000 * 60));

      // Check if customer has been waiting for exactly 10, 20, or 30 minutes
      // We use a 1-minute window to avoid missing notifications
      const isAtMilestone =
        (waitingMinutes >= 10 && waitingMinutes < 11) ||
        (waitingMinutes >= 20 && waitingMinutes < 21) ||
        (waitingMinutes >= 30 && waitingMinutes < 31);

      if (isAtMilestone) {
        // Send notification to admin
        io.emit("longWaitingCustomer", {
          id: `waiting-${entry.id}-${waitingMinutes}`,
          type: "LONG_WAITING",
          waitingListId: entry.id,
          customerName: entry.customerName,
          mobile: entry.mobile,
          peopleCount: entry.peopleCount,
          preferredTableSize: entry.preferredTableSize,
          waitingMinutes: waitingMinutes,
          message: `${entry.customerName} has been waiting for ${waitingMinutes} minutes`,
          createdAt: now.toISOString()
        });

        console.log(`⏰ Long waiting notification: ${entry.customerName} - ${waitingMinutes} minutes`);
      }
    }
  } catch (error) {
    console.error("❌ Error checking long waiting customers:", error.message);
  }
};

