const { Booking, Table } = require("../models");
const { Op } = require("sequelize");

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

  // Booking is active if it's within 30 minutes before or during the booking
  return timeDiffMinutes <= 30 && timeDiffMinutes >= -60; // 30 min before to 60 min after
};

// Helper function to calculate estimated waiting time for a table
const calculateEstimatedWaitTime = (table, booking) => {
  if (!table || !booking) return null;

  const now = new Date();

  // If table has occupiedSince timestamp, calculate elapsed time
  const occupiedSince = table.occupiedSince ? new Date(table.occupiedSince) : now;
  const elapsedMinutes = Math.floor((now - occupiedSince) / (1000 * 60));

  // Get booking duration (default 60 minutes if not set)
  const bookingDuration = booking.durationMinutes || 60;

  // Calculate remaining time: duration - elapsed time
  const remainingMinutes = Math.max(0, bookingDuration - elapsedMinutes);

  // Add 5-minute buffer for table cleanup
  const estimatedWaitTime = remainingMinutes + 5;

  return {
    estimatedMinutes: estimatedWaitTime,
    elapsedMinutes: elapsedMinutes,
    totalDuration: bookingDuration,
    occupiedSince: occupiedSince
  };
};

// Helper function to check for booking conflicts
const checkBookingConflict = async (tableId, bookingTime, bookingDate, bookingTimeSlot, durationMinutes) => {
  let newBookingStart, newBookingEnd;

  if (bookingDate && bookingTimeSlot) {
    // Pre-booking
    newBookingStart = new Date(`${bookingDate}T${bookingTimeSlot}`);
  } else {
    // Walk-in
    newBookingStart = new Date(bookingTime);
  }
  newBookingEnd = new Date(newBookingStart.getTime() + (durationMinutes || 60) * 60000);

  // Find all active bookings for this table
  const existingBookings = await Booking.findAll({
    where: {
      tableId,
      status: {
        [Op.in]: ["BOOKED", "CONFIRMED"]
      }
    }
  });

  // Check for time conflicts
  for (const existing of existingBookings) {
    let existingStart, existingEnd;

    if (existing.bookingDate && existing.bookingTimeSlot) {
      existingStart = new Date(`${existing.bookingDate}T${existing.bookingTimeSlot}`);
    } else {
      existingStart = new Date(existing.bookingTime);
    }
    existingEnd = new Date(existingStart.getTime() + (existing.durationMinutes || 60) * 60000);

    // Check if times overlap
    if (newBookingStart < existingEnd && newBookingEnd > existingStart) {
      return existing; // Conflict found
    }
  }

  return null; // No conflict
};

exports.createBooking = async (req, res) => {
  try {
    let bookingData = { ...req.body };

    // If bookingDate and bookingTimeSlot are not provided, extract them from bookingTime
    // This ensures walk-in bookings have proper date/time tracking
    if (!bookingData.bookingDate || !bookingData.bookingTimeSlot) {
      const bookingDateTime = new Date(bookingData.bookingTime);
      bookingData.bookingDate = bookingDateTime.toISOString().split('T')[0]; // YYYY-MM-DD
      bookingData.bookingTimeSlot = `${String(bookingDateTime.getHours()).padStart(2, '0')}:${String(bookingDateTime.getMinutes()).padStart(2, '0')}`; // HH:MM
    }

    // Check for conflicts
    const conflict = await checkBookingConflict(
      req.body.tableId,
      req.body.bookingTime,
      req.body.bookingDate,
      req.body.bookingTimeSlot,
      req.body.durationMinutes
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

      // Check if admin explicitly confirmed auto-scheduling
      if (req.body.confirmAutoSchedule) {
        // Admin confirmed, schedule after conflict
        const newBookingTime = new Date(conflictEndTime.getTime() + 5 * 60000);
        bookingData.bookingTime = newBookingTime.toISOString();

        // Update bookingDate and bookingTimeSlot for the new scheduled time
        bookingData.bookingDate = newBookingTime.toISOString().split('T')[0];
        bookingData.bookingTimeSlot = `${String(newBookingTime.getHours()).padStart(2, '0')}:${String(newBookingTime.getMinutes()).padStart(2, '0')}`;

        console.log(`Admin confirmed auto-scheduling. New time: ${newBookingTime.toISOString()}`);
      } else {
        // Show conflict to admin for confirmation (both WALK-IN and PRE-BOOKING)
        const table = await Table.findByPk(req.body.tableId);
        const waitTimeInfo = calculateEstimatedWaitTime(table, conflict);

        return res.status(409).json({
          message: "Booking conflict detected",
          conflict: {
            id: conflict.id,
            customerName: conflict.customerName,
            bookingTime: conflict.bookingTime,
            bookingDate: conflict.bookingDate,
            bookingTimeSlot: conflict.bookingTimeSlot,
            durationMinutes: conflict.durationMinutes,
            endTime: conflictEndTime.toISOString()
          },
          estimatedWaitTime: waitTimeInfo,
          suggestedTime: new Date(conflictEndTime.getTime() + 5 * 60000).toISOString()
        });
      }
    }

    const booking = await Booking.create(bookingData);

    // Only set table as BOOKED if booking is active AND table is not already OCCUPIED
    const shouldBeBooked = isBookingActive(bookingData.bookingTime, bookingData.bookingDate, bookingData.bookingType);

    if (shouldBeBooked) {
      // Get current table status
      const table = await Table.findByPk(bookingData.tableId);

      // Only change to BOOKED if table is AVAILABLE (not if OCCUPIED)
      // If table is OCCUPIED, keep it OCCUPIED (current customer still sitting)
      if (table && table.status === "AVAILABLE") {
        await Table.update(
          {
            status: "BOOKED"
            // Do NOT set occupiedSince here - only when customer actually sits (OCCUPIED)
          },
          { where: { id: bookingData.tableId } }
        );

        req.io.emit("tableStatusUpdated", {
          tableId: bookingData.tableId,
          status: "BOOKED"
        });
      }
      // If table is OCCUPIED, don't change status - new booking is queued as "next booking"
    }

    req.io.emit("bookingCreated", booking);
    req.io.emit("dashboardUpdated");

    // Include info about auto-scheduling in response
    const response = {
      ...booking.toJSON(),
      autoScheduled: conflict && req.body.bookingType === "WALK_IN",
      originalRequestTime: conflict ? req.body.bookingTime : null
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getBookings = async (req, res) => {
  res.json(await Booking.findAll({ include: Table }));
};

// Get upcoming bookings for a specific table (TODAY ONLY - within 24 hours)
// exports.getUpcomingBookingsForTable = async (req, res) => {
//   try {
//     const { tableId } = req.params;
//     const now = new Date();
//     const { isTodaysBooking, bookingDate } = req.body;

//     // Calculate today's date range (start and end of today)
//     const todayStart = new Date();
//     todayStart.setHours(0, 0, 0, 0);

//     const todayEnd = new Date();
//     todayEnd.setHours(23, 59, 59, 999);

//     const todayStr = todayStart.toISOString().split('T')[0];

//     const upcomingBookings = await Booking.findAll({
//       where: {
//         tableId,
//         status: {
//           [Op.in]: ["BOOKED", "CONFIRMED"]
//         },
//         [Op.or]: [
//           // Pre-bookings scheduled for TODAY only
//           {
//             bookingType: "PRE_BOOKING",
//             bookingDate: todayStr,
//             bookingTime: {
//               [Op.gte]: now // Only future bookings today
//             }
//           },
//           // Walk-in bookings created today with future time
//           {
//             bookingType: "WALK_IN",
//             bookingTime: {
//               [Op.gte]: now,
//               [Op.lte]: todayEnd // Only within today
//             }
//           }
//         ]
//       },
//       order: [
//         ['bookingDate', 'ASC'],
//         ['bookingTimeSlot', 'ASC'],
//         ['bookingTime', 'ASC']
//       ],
//       limit: 5 // Get next 5 upcoming bookings (today only)
//     });

//     res.json(upcomingBookings);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

// Get upcoming bookings for a specific table (TODAY or selected date)
exports.getUpcomingBookingsForTable = async (req, res) => {
  try {
    const { tableId } = req.params;
    const { isTodaysBooking = true, bookingDate } = req.body;

    const now = new Date();
    const bufferTime = new Date(now.getTime() - 60 * 60 * 1000);


    // Determine date range
    let startDate, endDate;

    if (isTodaysBooking) {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    } else {
      if (!bookingDate) {
        return res.status(400).json({ message: "bookingDate is required" });
      }

      startDate = new Date(bookingDate);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(bookingDate);
      endDate.setHours(23, 59, 59, 999);
    }

    const upcomingBookings = await Booking.findAll({
      where: {
        tableId,
        status: {
          [Op.in]: ["BOOKED", "CONFIRMED"],
        },
        bookingDate: {
          [Op.between]: [
            startDate.toISOString().split("T")[0],
            endDate.toISOString().split("T")[0],
          ],
        },
        bookingTime: {
          [Op.between]: [
            isTodaysBooking ? bufferTime : startDate,
            endDate,
          ],
        },
      },
      order: [
        ["bookingDate", "ASC"],
        ["bookingTimeSlot", "ASC"],
        ["bookingTime", "ASC"],
      ]
    });

    res.json(upcomingBookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.cancelBooking = async (req, res) => {
  const booking = await Booking.findByPk(req.params.id);
  booking.status = "CANCELLED";
  await booking.save();

  // Check if there are other active bookings for this table
  const otherActiveBookings = await Booking.findAll({
    where: {
      tableId: booking.tableId,
      status: {
        [Op.in]: ["BOOKED", "CONFIRMED"]
      },
      id: {
        [Op.ne]: booking.id // Exclude the booking we just cancelled
      }
    }
  });

  // Only mark table as AVAILABLE if there are NO other active bookings
  if (otherActiveBookings.length === 0) {
    await Table.update(
      {
        status: "AVAILABLE",
        occupiedSince: null
      },
      { where: { id: booking.tableId } }
    );

    req.io.emit("tableStatusUpdated", {
      tableId: booking.tableId,
      status: "AVAILABLE"
    });
  }

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

    // Check if there are other active bookings for this table (next bookings)
    const otherActiveBookings = await Booking.findAll({
      where: {
        tableId: booking.tableId,
        status: {
          [Op.in]: ["BOOKED", "CONFIRMED"]
        },
        id: {
          [Op.ne]: booking.id // Exclude the booking we just completed
        }
      },
      order: [["bookingTime", "ASC"]] // Sort by time to get next booking first
    });

    // Only mark table as AVAILABLE if there are NO other active bookings
    if (otherActiveBookings.length === 0) {
      await Table.update(
        {
          status: "AVAILABLE",
          occupiedSince: null // Clear the timer
        },
        { where: { id: booking.tableId } }
      );

      req.io.emit("tableStatusUpdated", {
        tableId: booking.tableId,
        status: "AVAILABLE"
      });
    } else {
      // There are other bookings - keep table as BOOKED for next booking
      // Clear occupiedSince (customer left, waiting for next customer)
      await Table.update(
        {
          status: "BOOKED", // Keep as BOOKED - next booking exists
          occupiedSince: null // Clear timer (customer left)
        },
        { where: { id: booking.tableId } }
      );

      req.io.emit("tableStatusUpdated", {
        tableId: booking.tableId,
        status: "BOOKED"
      });
    }

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

// Get available tables based on party size and date/time
exports.getAvailableTables = async (req, res) => {
  try {
    const { peopleCount, bookingDate, bookingTimeSlot } = req.query;

    // Determine required table size based on people count
    let tableSize;
    if (peopleCount <= 2) {
      tableSize = "SMALL";
    } else if (peopleCount <= 4) {
      tableSize = "MEDIUM";
    } else {
      tableSize = "LARGE";
    }

    // Find all tables with compatible sizes
    const allTables = await Table.findAll({
      where: {
        size: {
          [Op.in]: getCompatibleSizes(tableSize)
        }
      },
      include: [{
        model: require("../models").Floor,
        attributes: ["id", "floorNumber", "name"]
      }]
    });

    // Filter tables based on availability for the requested date/time
    const availableTables = [];

    for (const table of allTables) {
      // If table is currently AVAILABLE, check if it has future bookings
      if (table.status === "AVAILABLE") {
        // Check if there's a booking for the requested date/time
        if (bookingDate && bookingTimeSlot) {
          const conflictingBooking = await Booking.findOne({
            where: {
              tableId: table.id,
              bookingDate: bookingDate,
              bookingTimeSlot: bookingTimeSlot,
              status: {
                [Op.in]: ["BOOKED", "CONFIRMED"]
              }
            }
          });

          if (!conflictingBooking) {
            availableTables.push(table);
          }
        } else {
          // For walk-in (no specific date/time), table is available
          availableTables.push(table);
        }
      } else if (table.status === "BOOKED") {
        // Check if the booking is for a future time
        const currentBooking = await Booking.findOne({
          where: {
            tableId: table.id,
            status: "BOOKED"
          },
          order: [["bookingTime", "DESC"]]
        });

        if (currentBooking && !isBookingActive(currentBooking.bookingTime, currentBooking.bookingDate, currentBooking.bookingType)) {
          // Booking is for future, table is actually available now
          if (bookingDate && bookingTimeSlot) {
            // Check if requested time conflicts with the future booking
            const isSameBooking = currentBooking.bookingDate === bookingDate &&
                                  currentBooking.bookingTimeSlot === bookingTimeSlot;
            if (!isSameBooking) {
              availableTables.push(table);
            }
          } else {
            // Walk-in booking, table is available now
            availableTables.push(table);
          }
        }
      }
    }

    res.json({
      tables: availableTables,
      recommendedSize: tableSize
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper function to get compatible table sizes
function getCompatibleSizes(requiredSize) {
  const sizeHierarchy = {
    "SMALL": ["SMALL", "MEDIUM", "LARGE"],
    "MEDIUM": ["MEDIUM", "LARGE"],
    "LARGE": ["LARGE"]
  };
  return sizeHierarchy[requiredSize] || ["SMALL", "MEDIUM", "LARGE"];
}

// Get bookings by date (for pre-booking calendar)
exports.getBookingsByDate = async (req, res) => {
  try {
    const { date } = req.query;

    const bookings = await Booking.findAll({
      where: {
        bookingDate: date,
        status: {
          [Op.in]: ["BOOKED", "CONFIRMED", "WAITING"]
        }
      },
      include: Table
    });

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Sync table statuses based on booking times
// exports.syncTableStatuses = async (req, res) => {
//   try {
//     // Get all active bookings
//     const bookings = await Booking.findAll({
//       where: {
//         status: {
//           [Op.in]: ["BOOKED", "CONFIRMED"]
//         }
//       },
//       include: Table
//     });

//     let updatedCount = 0;

//     for (const booking of bookings) {
//       if (!booking.Table) continue;

//       const isActive = isBookingActive(booking.bookingTime, booking.bookingDate, booking.bookingType);

//       // IMPORTANT: If booking is CONFIRMED by admin, keep table as BOOKED regardless of time
//       const isConfirmedByAdmin = booking.confirmationStatus === "CONFIRMED";

//       // If booking is active OR confirmed by admin, table should be BOOKED
//       if ((isActive || isConfirmedByAdmin) && booking.Table.status !== "BOOKED" && booking.Table.status !== "OCCUPIED") {
//         await Table.update(
//           {
//             status: "BOOKED"
//             // Do NOT set occupiedSince - only when customer actually sits (OCCUPIED)
//           },
//           { where: { id: booking.tableId } }
//         );
//         updatedCount++;

//         if (req.io) {
//           req.io.emit("tableStatusUpdated", {
//             tableId: booking.tableId,
//             status: "BOOKED"
//           });
//         }
//       }

//       // Check if booking has ended (past the booking end time)
//       let bookingEndTime;
//       if (booking.bookingDate && booking.bookingTimeSlot) {
//         const bookingStart = new Date(`${booking.bookingDate}T${booking.bookingTimeSlot}`);
//         bookingEndTime = new Date(bookingStart.getTime() + (booking.durationMinutes + 30 || 90) * 60000);
//       } else {
//         const bookingStart = new Date(booking.bookingTime);
//         bookingEndTime = new Date(bookingStart.getTime() + (booking.durationMinutes + 30 || 90) * 60000);
//       }

//       const now = new Date();
//       const hasEnded = now > bookingEndTime;

//       // Only change to AVAILABLE if booking has actually ENDED (not just inactive)
//       // AND not confirmed by admin
//       if (hasEnded && !isConfirmedByAdmin && booking.Table.status === "BOOKED") {
//         await Table.update(
//           {
//             status: "AVAILABLE",
//             occupiedSince: null, // Clear timestamp
//             availableInMinutes: null // Clear staff-set availability time
//           },
//           { where: { id: booking.tableId } }
//         );
//         updatedCount++;

//         if (req.io) {
//           req.io.emit("tableStatusUpdated", {
//             tableId: booking.tableId,
//             status: "AVAILABLE"
//           });
//         }
//       }
//     }

//     if (req.io) {
//       req.io.emit("dashboardUpdated");
//     }

//     res.json({
//       message: "Table statuses synced successfully",
//       updatedCount
//     });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

exports.syncTableStatuses = async (req, res) => {
  try {
    const now = new Date();
    const PRE_HOLD_MINUTES = 45;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);


    const bookings = await Booking.findAll({
      where: {
        status: { [Op.in]: ["BOOKED", "CONFIRMED"] },
    
        [Op.or]: [
          // Pre-bookings (bookingDate exists)
          {
            bookingDate: {
              [Op.between]: [startOfToday, endOfToday]
            }
          },
          // Walk-ins (bookingDate NULL)
          {
            bookingDate: null,
            bookingTime: {
              [Op.between]: [startOfToday, endOfToday]
            }
          }
        ]
      },
      include: Table
    });

    // Group bookings by table
    const tableMap = {};

    for (const booking of bookings) {
      if (!booking.Table) continue;

      if (!tableMap[booking.tableId]) {
        tableMap[booking.tableId] = {
          table: booking.Table,
          bookings: []
        };
      }
      tableMap[booking.tableId].bookings.push(booking);
    }

    let updatedCount = 0;

    for (const tableId in tableMap) {
      const { table, bookings } = tableMap[tableId];

      let hasActiveBooking = false;
      let nearestUpcomingStart = null;

      for (const booking of bookings) {
        const isConfirmedByAdmin = booking.confirmationStatus === "CONFIRMED";

        // ---- booking start
        let startTime;
        if (booking.bookingDate && booking.bookingTimeSlot) {
          startTime = new Date(`${booking.bookingDate}T${booking.bookingTimeSlot}`);
        } else {
          startTime = new Date(booking.bookingTime);
        }

        // ---- booking end
        const duration =
          typeof booking.durationMinutes === "number"
            ? booking.durationMinutes + 30
            : 90;

        const endTime = new Date(startTime.getTime() + duration * 60000);

        // ---- ACTIVE booking
        if ((now >= startTime && now <= endTime)) {
          hasActiveBooking = true;
          break;
        }

        // ---- find nearest upcoming booking
        if (startTime > now) {
          if (!nearestUpcomingStart || startTime < nearestUpcomingStart) {
            nearestUpcomingStart = startTime;
          }
        }
      }

      // ---- Decide status
      let nextStatus = "AVAILABLE";

      if (hasActiveBooking) {
        nextStatus = "BOOKED";
      } else if (
        nearestUpcomingStart &&
        nearestUpcomingStart <= new Date(now.getTime() + PRE_HOLD_MINUTES * 60000)
      ) {
        nextStatus = "BOOKED";
      }

      if (table.status !== nextStatus && table.status !== "OCCUPIED") {
        await Table.update(
          {
            status: nextStatus,
            occupiedSince: nextStatus === "AVAILABLE" ? null : table.occupiedSince,
            availableInMinutes:
              nextStatus === "AVAILABLE"
                ? Math.max(
                    0,
                    nearestUpcomingStart
                      ? Math.floor((nearestUpcomingStart - now) / 60000)
                      : null
                  )
                : null
          },
          { where: { id: tableId } }
        );

        updatedCount++;

        if (req.io) {
          req.io.emit("tableStatusUpdated", {
            tableId,
            status: nextStatus
          });
        }
      }
    }

    if (req.io) {
      req.io.emit("dashboardUpdated");
    }

    res.json({
      message: "Table statuses synced with 45-minute availability rule",
      updatedCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// Override booking - Move existing booking to waiting list and create new booking
exports.overrideBooking = async (req, res) => {
  try {
    const { WaitingList } = require("../models");
    const { conflictingBookingId } = req.body;

    // Find the conflicting booking
    const existingBooking = await Booking.findByPk(conflictingBookingId);
    if (!existingBooking) {
      return res.status(404).json({ message: "Conflicting booking not found" });
    }

    // Move existing booking to waiting list
    await WaitingList.create({
      customerName: existingBooking.customerName,
      mobile: existingBooking.mobile,
      email: existingBooking.email,
      peopleCount: existingBooking.peopleCount,
      preferredTableSize: "MEDIUM", // Default, can be calculated based on peopleCount
      bookingType: existingBooking.bookingType,
      bookingDate: existingBooking.bookingDate,
      bookingTimeSlot: existingBooking.bookingTimeSlot,
      priority: existingBooking.priority || 0,
      status: "WAITING"
    });

    // Cancel the existing booking
    existingBooking.status = "CANCELLED";
    await existingBooking.save();

    // Create new booking
    const newBooking = await Booking.create(req.body);

    // Set table status if booking is active AND table is not OCCUPIED
    const shouldBeBooked = isBookingActive(req.body.bookingTime, req.body.bookingDate, req.body.bookingType);
    if (shouldBeBooked) {
      // Get current table status
      const table = await Table.findByPk(req.body.tableId);

      // Only change to BOOKED if table is AVAILABLE (not if OCCUPIED)
      if (table && table.status === "AVAILABLE") {
        await Table.update(
          {
            status: "BOOKED"
            // Do NOT set occupiedSince - only when customer actually sits (OCCUPIED)
          },
          { where: { id: req.body.tableId } }
        );

        req.io.emit("tableStatusUpdated", {
          tableId: req.body.tableId,
          status: "BOOKED"
        });
      }
      // If table is OCCUPIED, don't change status - new booking is queued
    }

    // Emit events
    req.io.emit("bookingOverridden", {
      cancelled: existingBooking,
      new: newBooking
    });
    req.io.emit("waitingListUpdated");
    req.io.emit("dashboardUpdated");

    res.json({
      message: "Booking overridden successfully",
      newBooking,
      movedToWaitingList: {
        customerName: existingBooking.customerName,
        mobile: existingBooking.mobile
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Export helper function for use in other controllers
exports.checkBookingConflict = checkBookingConflict;
