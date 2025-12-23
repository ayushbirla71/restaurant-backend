const { sequelize } = require("../models");

async function syncDatabase() {
  try {
    console.log("🔄 Syncing database schema...");
    
    // Sync with alter: true to add new columns without dropping tables
    await sequelize.sync({ alter: true });
    
    console.log("✅ Database schema synced successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error syncing database:", error);
    process.exit(1);
  }
}

syncDatabase();

