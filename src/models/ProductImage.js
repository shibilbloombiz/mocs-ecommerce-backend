const mongoose = require("mongoose");

const productImageSchema = new mongoose.Schema(
  {
    filename: String,
    contentType: {
      type: String,
      required: true,
    },
    size: Number,
    data: {
      type: Buffer,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProductImage", productImageSchema);
