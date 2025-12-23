const { Floor, Table, Booking, WaitingList } = require("../models");
const { Op } = require("sequelize");

exports.getDashboardStats = async (req, res) => {
  const start = new Date();
  start.setHours(0,0,0,0);

  const end = new Date();
  end.setHours(23,59,59,999);

  const todayBookings = await Booking.findAll({
    where: { createdAt: { [Op.between]: [start, end] } }
  });

  const floorData = await Floor.findAll({ include: Table });

  // Get waiting list stats
  const waitingCount = await WaitingList.count({
    where: { status: { [Op.in]: ["WAITING", "NOTIFIED"] } }
  });

  const preBookingWaitingCount = await WaitingList.count({
    where: {
      status: { [Op.in]: ["WAITING", "NOTIFIED"] },
      bookingType: "PRE_BOOKING"
    }
  });

  // Get today's pre-bookings
  const todayDate = new Date().toISOString().split("T")[0];
  const todayPreBookings = await Booking.count({
    where: {
      bookingDate: todayDate,
      bookingType: "PRE_BOOKING",
      status: { [Op.in]: ["BOOKED", "CONFIRMED"] }
    }
  });

  res.json({
    summary: {
      totalFloors: await Floor.count(),
      totalTables: await Table.count(),
      availableTables: await Table.count({ where: { status: "AVAILABLE" } }),
      bookedTables: await Table.count({ where: { status: "BOOKED" } }),
      occupiedTables: await Table.count({ where: { status: "OCCUPIED" } }),
      todayBookingCount: todayBookings.length,
      totalGuestsToday: todayBookings.reduce((s,b)=>s+(b.peopleCount||0),0),
      waitingListCount: waitingCount,
      preBookingWaitingCount: preBookingWaitingCount,
      todayPreBookings: todayPreBookings
    },
    floorStats: floorData.map(f => ({
      floorId: f.id,
      floorName: f.name,
      totalTables: f.Tables.length
    })),
    sizeStats: {
      SMALL: await Table.count({ where: { size: "SMALL" } }),
      MEDIUM: await Table.count({ where: { size: "MEDIUM" } }),
      LARGE: await Table.count({ where: { size: "LARGE" } })
    }
  });
};
