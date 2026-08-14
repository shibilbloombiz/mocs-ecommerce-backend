const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    password: { type: String, minlength: 8, select: false },
    role: { type: String, enum: ["user", "admin", "superadmin"], default: "user" },
    jobTitle: { type: String, default: "" },
    phone: String,
    address: mongoose.Schema.Types.Mixed,
    avatar: String,
    resetToken: String,
    resetTokenExpiry: Date,
    isDeleted: { type: Boolean, default: false },
    clerkId: { type: String, index: true },
    googleId: { type: String, index: true, sparse: true },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
  },
  { timestamps: true },
);

userSchema.pre("validate", function (next) {
  // Password is required for local auth only
  if (this.authProvider === "local" && this.isNew && !this.password) {
    this.invalidate("password", "Password is required for local accounts");
  }
  if (this.address && typeof this.address !== "string") {
    if (typeof this.address === "object") {
      try {
        const parts = [];
        if (this.address.line1) parts.push(this.address.line1);
        if (this.address.city) parts.push(this.address.city);
        if (this.address.postalCode) parts.push(this.address.postalCode);
        if (this.address.country) parts.push(this.address.country);
        this.address = parts.length > 0 ? parts.join(", ") : JSON.stringify(this.address);
      } catch (e) {
        this.address = "";
      }
    } else {
      this.address = String(this.address);
    }
  }
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("User", userSchema);
