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
      name: String,
      fullName: String, // backwards compatibility
      phone: String,
      email: String,
      address: String,
      line1: String, // backwards compatibility
      city: String,
      state: String,
      pincode: String,
      postalCode: String, // backwards compatibility
      country: { type: String, default: "India" },
    },
    paymentMethod: { type: String, default: "COD" },
    paymentStatus: {
      type: String,
      default: "Pending",
      index: true,
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    transactionId: String,
    paymentFailureReason: String,
    cancelReason: String,
    returnReason: String,
    refundDetails: {
      refundMethod: {
        type: String,
        default: "none",
      },
      refundStatus: {
        type: String,
        default: "None",
      },
      bankDetails: {
        accountHolderName: String,
        accountNumber: String,
        ifscCode: String,
        bankName: String,
        maskedAccountNumber: String,
      },
      upiDetails: {
        upiId: String,
        maskedUpiId: String,
      },
      refundAmount: Number,
      refundTransactionId: String,
      refundInitiatedAt: Date,
      refundEstimatedDate: Date,
      refundCompletedAt: Date,
      adminNotes: String,
    },
    subtotal: Number,
    shipping: Number,
    shippingCharge: Number,
    tax: Number,
    total: { type: Number, required: true },
    totalAmount: Number,
    status: {
      type: String,
      default: "pending",
    },
    orderStatus: {
      type: String,
      default: "Placed",
      index: true,
    },

    statusHistory: {
      type: [
        {
          status: { type: String, required: true },
          note: { type: String, default: "" },
          updatedBy: { type: String, default: "system" },
          updatedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    paidAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Order", orderSchema);
