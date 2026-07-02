const mongoose = require("mongoose");

const querySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "resolved", "ignored"],
      default: "pending",
      index: true,
    },
    adminNotes: { type: String, default: "" },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Query", querySchema);
