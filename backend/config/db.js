// config/db.js
// Mock DB mode (No MongoDB)

const connectDB = async () => {
  try {
    console.log("⚠️ Running in MOCK MODE (No MongoDB connected)");
    console.log("✔️ App will work without database for now");
  } catch (error) {
    console.error("❌ DB error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;