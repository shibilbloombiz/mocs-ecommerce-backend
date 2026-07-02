require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

const seedAdmin = async () => {
  const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/mocs";
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@mocs.com";
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "mocsadmin123";
  const ADMIN_NAME = process.env.ADMIN_NAME || "Mocs Super Admin";

  try {
    console.log("Connecting to Database...");
    await mongoose.connect(MONGO_URI);
    console.log("Database connected successfully.");

    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });
    if (existingAdmin) {
      console.log(`User ${ADMIN_EMAIL} already exists.`);
      existingAdmin.role = "superadmin";
      existingAdmin.isDeleted = false;
      existingAdmin.password = ADMIN_PASSWORD; // will trigger pre-save hashing
      if (existingAdmin.address && typeof existingAdmin.address !== "string") {
        existingAdmin.address = "";
      }
      await existingAdmin.save();
      console.log(`Updated existing user role to 'superadmin' and reset password.`);
    } else {
      console.log(`Creating new superadmin user with email: ${ADMIN_EMAIL}`);
      await User.create({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: "superadmin",
      });
      console.log("Superadmin seeded successfully!");
    }
  } catch (error) {
    console.error("Seeding failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from database.");
    process.exit(0);
  }
};

seedAdmin();
