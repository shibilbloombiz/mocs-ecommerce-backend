const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: String,
    image: String,
    size: Number,
    color: String,
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: [orderItemSchema],
    shippingAddress: {
      fullName: String,
      line1: String,
      city: String,
      postalCode: String,
      country: String,
    },
    paymentMethod: { type: String, default: "razorpay" },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    paymentFailureReason: String,
    cancelReason: String,
    returnReason: String,
    subtotal: Number,
    shipping: Number,
    tax: Number,
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "paid", "shipped", "delivered", "cancelled", "returned", "return_requested", "PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED"],
      default: "pending",
    },
    paidAt: Date,
    deliveredAt: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Order", orderSchema);
