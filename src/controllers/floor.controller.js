const { Floor, Table } = require("../models");

exports.createFloor = async (req, res) => {
  const floor = await Floor.create(req.body);

  // Emit real-time update
  req.io.emit("floorCreated", floor);
  req.io.emit("dashboardUpdated");

  res.json(floor);
};

exports.deleteFloor = async (req, res) => {
  try {
    await Floor.destroy({
      where: { id: req.params.id }
    });

    // Emit real-time update
    req.io.emit("floorDeleted", req.params.id);
    req.io.emit("dashboardUpdated");

    res.json({ message: "Floor deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
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
