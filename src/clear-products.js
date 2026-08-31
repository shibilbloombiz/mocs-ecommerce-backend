const path = require("path");
require("dotenv").config();
if (!process.env.MONGO_URI) {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
}
const mongoose = require("mongoose");
const Product = require("./models/Product");

const clearProducts = async () => {
  const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/mocs";

  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected.");

    const result = await Product.deleteMany({});
    console.log(`✅ Cleared ${result.deletedCount} sample products from the database.`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to clear products:", error);
    process.exit(1);
  }
};

clearProducts();
