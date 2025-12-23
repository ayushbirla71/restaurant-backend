const { Table } = require("../models");

async function updateTableSeats() {
  try {
    console.log("🔄 Updating table seats...");

    // Get all tables
    const tables = await Table.findAll();

    for (const table of tables) {
      // Set seats based on size if not already set
      if (!table.seats || table.seats === 0) {
        let seats;
        switch (table.size) {
          case "SMALL":
            seats = 2;
            break;
          case "MEDIUM":
            seats = 4;
            break;
          case "LARGE":
            seats = 6;
            break;
          default:
            seats = 2;
        }

        table.seats = seats;
        await table.save();
        console.log(`✅ Updated table ${table.tableNumber} with ${seats} seats`);
      }
    }

    console.log("✅ All tables updated successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error updating tables:", error);
    process.exit(1);
  }
}

updateTableSeats();

