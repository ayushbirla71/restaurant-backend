const { Booking, Table } = require("../models");
const { Op } = require("sequelize");

// Check for upcoming bookings and send notifications
exports.checkUpcomingBookings = async (io) => {
  try {
    const now = new Date();
    const notificationIntervals = [30, 20, 10, 5]; // minutes before booking

    for (const minutes of notificationIntervals) {
      const targetTime = new Date(now.getTime() + minutes * 60000);
      const windowStart = new Date(targetTime.getTime() - 60000); // 1 min before
      const windowEnd = new Date(targetTime.getTime() + 60000); // 1 min after

      // Find bookings that should trigger notifications
      const bookings = await Booking.findAll({
        where: {
          status: {
            [Op.in]: ["BOOKED", "CONFIRMED"]
          },
          confirmationStatus: {
            [Op.in]: ["PENDING", "CONFIRMED"]
          }
        },
        include: [Table]
      });

      for (const booking of bookings) {
        let bookingDateTime;

        if (booking.bookingDate && booking.bookingTimeSlot) {
          // Pre-booking
          bookingDateTime = new Date(`${booking.bookingDate}T${booking.bookingTimeSlot}`);
        } else {
          // Walk-in booking
          bookingDateTime = new Date(booking.bookingTime);
        }

        // Check if this booking is in the notification window
        if (bookingDateTime >= windowStart && bookingDateTime <= windowEnd) {
          // Check if notification for this interval was already sent
          const notificationsSent = booking.notificationsSent || [];
          const notificationKey = `${minutes}min`;

          if (!notificationsSent.includes(notificationKey)) {
            // Send notification
            const notification = {
              id: `notif-${booking.id}-${minutes}`,
              bookingId: booking.id,
              tableId: booking.tableId,
              tableNumber: booking.Table?.tableNumber,
              customerName: booking.customerName,
              mobile: booking.mobile,
              peopleCount: booking.peopleCount,
              bookingTime: bookingDateTime.toISOString(),
              minutesBefore: minutes,
              confirmationStatus: booking.confirmationStatus,
              message: `Table ${booking.Table?.tableNumber} booked for ${booking.customerName} in ${minutes} minutes`,
              timestamp: new Date().toISOString()
            };

            // Emit notification via socket
            io.emit("upcomingBookingNotification", notification);

            // Update booking to mark notification as sent
            notificationsSent.push(notificationKey);
            await booking.update({ notificationsSent });

            console.log(`📢 Notification sent: Table ${booking.Table?.tableNumber} - ${minutes} min before`);
          }
        }
      }
    }
  } catch (error) {
    console.error("❌ Error checking upcoming bookings:", error.message);
  }
};

// Get all pending notifications (bookings needing confirmation)
exports.getPendingNotifications = async (req, res) => {
  try {
    const now = new Date();
    const next2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const pendingBookings = await Booking.findAll({
      where: {
        status: {
          [Op.in]: ["BOOKED", "CONFIRMED"]
        },
        confirmationStatus: "PENDING"
      },
      include: [Table],
      order: [
        ['bookingDate', 'ASC'],
        ['bookingTimeSlot', 'ASC'],
        ['bookingTime', 'ASC']
      ]
    });

    // Filter bookings within next 2 hours
    const upcomingBookings = pendingBookings.filter(booking => {
      let bookingDateTime;
      if (booking.bookingDate && booking.bookingTimeSlot) {
        bookingDateTime = new Date(`${booking.bookingDate}T${booking.bookingTimeSlot}`);
      } else {
        bookingDateTime = new Date(booking.bookingTime);
      }
      return bookingDateTime >= now && bookingDateTime <= next2Hours;
    });

    res.json(upcomingBookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Confirm booking
exports.confirmBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findByPk(id, { include: [Table] });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    booking.confirmationStatus = "CONFIRMED";
    booking.confirmedAt = new Date();
    booking.status = "BOOKED"; // Mark booking as BOOKED
    await booking.save();

    // Mark table as BOOKED (only if not already OCCUPIED)
    if (booking.tableId) {
      const table = await Table.findByPk(booking.tableId);

      // Only change to BOOKED if table is AVAILABLE (not if OCCUPIED)
      if (table && table.status === "AVAILABLE") {
        await Table.update(
          {
            status: "BOOKED"
            // Do NOT set occupiedSince - only when customer actually sits (OCCUPIED)
          },
          { where: { id: booking.tableId } }
        );

        req.io.emit("tableStatusUpdated", {
          tableId: booking.tableId,
          status: "BOOKED"
        });
      }
      // If table is OCCUPIED, don't change status - booking is queued
    }

    req.io.emit("bookingConfirmed", booking);
    req.io.emit("bookingUpdated", booking);
    req.io.emit("dashboardUpdated");

    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark client as delayed
exports.markClientDelayed = async (req, res) => {
  try {
    const { id } = req.params;
    const { delayMinutes } = req.body;
    const booking = await Booking.findByPk(id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Update confirmation status and delay minutes
    booking.confirmationStatus = "CLIENT_DELAYED";
    booking.delayMinutes = delayMinutes || 0;

    // Update the actual booking time by adding the delay
    if (booking.bookingDate && booking.bookingTimeSlot) {
      // For pre-bookings with date and time slot
      const originalTime = new Date(`${booking.bookingDate}T${booking.bookingTimeSlot}`);
      const newTime = new Date(originalTime.getTime() + (delayMinutes * 60000));

      // Update bookingTime (ISO string)
      booking.bookingTime = newTime.toISOString();

      // Update bookingTimeSlot (HH:MM format)
      const hours = String(newTime.getHours()).padStart(2, '0');
      const minutes = String(newTime.getMinutes()).padStart(2, '0');
      booking.bookingTimeSlot = `${hours}:${minutes}`;

      // Keep the same date (unless delay pushes it to next day)
      const newDate = newTime.toISOString().split('T')[0];
      booking.bookingDate = newDate;
    } else {
      // For walk-in bookings or bookings with only bookingTime
      const originalTime = new Date(booking.bookingTime);
      const newTime = new Date(originalTime.getTime() + (delayMinutes * 60000));
      booking.bookingTime = newTime.toISOString();
    }

    await booking.save();

    req.io.emit("bookingDelayed", booking);
    req.io.emit("bookingUpdated", booking);
    req.io.emit("dashboardUpdated");

    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = exports;

