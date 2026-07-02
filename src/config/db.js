const mongoose = require("mongoose");
const Category = require("../models/Category");

module.exports = async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set");
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log("MongoDB connected");

  // Seed standard categories
  const defaults = ["Men", "Women", "Kids"];
  for (const name of defaults) {
    const slug = name.toLowerCase();
    const exists = await Category.findOne({ slug });
    if (!exists) {
      await Category.create({
        name,
        slug,
        description: `Premium ${name}'s footwear collection`,
      });
      console.log(`Seeded category: ${name}`);
    }
  }
};
