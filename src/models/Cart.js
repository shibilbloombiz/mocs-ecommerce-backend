const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    size: { type: Number, required: true },
    color: { type: String, required: true },
    qty: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: true, timestamps: true },
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: [cartItemSchema],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Cart", cartSchema);
