const { Floor, Table } = require("../models");

exports.createFloor = async (req, res) => {
  const floor = await Floor.create(req.body);

  // Emit real-time update
  req.io.emit("floorCreated", floor);
  req.io.emit("dashboardUpdated");

  res.json(floor);
};

exports.getFloors = async (req, res) => {
  res.json(await Floor.findAll());
};

exports.getFloorsWithTables = async (req, res) => {
  try {
    const floors = await Floor.findAll({
      order: [['floorNumber', 'ASC']],
      include: [{
        model: Table,
        as: 'Tables',
        order: [['tableNumber', 'ASC']]
      }]
    });
    res.json(floors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
