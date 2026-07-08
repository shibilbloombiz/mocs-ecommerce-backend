const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const razorpay = require("../services/razorpay.service");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");

// POST /api/payments/create-order
// Protect middleware required
exports.createOrder = asyncHandler(async (req, res) => {
  const { shippingAddress } = req.body;
  if (!shippingAddress) {
    res.status(400);
    throw new Error("Shipping address is required");
  }

  const name = shippingAddress.name || shippingAddress.fullName;
  const phone = shippingAddress.phone;
  const email = shippingAddress.email || req.user.email;
  const address = shippingAddress.address || shippingAddress.line1;
  const city = shippingAddress.city;
  const state = shippingAddress.state;
  const pincode = shippingAddress.pincode || shippingAddress.postalCode;

  if (!name || !phone || !address || !city || !state || !pincode) {
    res.status(400);
    throw new Error("Complete shipping details (name, phone, address, city, state, pincode) are required");
  }

  const cleanShippingAddress = {
    name,
    fullName: name,
    phone,
    email,
    address,
    line1: address,
    city,
    state,
    pincode,
    postalCode: pincode,
    country: shippingAddress.country || "India"
  };

  const bodyItems =
    req.body.items ||
    req.body.cartItems ||
    req.body.orderItems ||
    [];

  let items = [];
  if (bodyItems && bodyItems.length > 0) {
    for (const item of bodyItems) {
      const productId =
        item.product ||
        item.productId ||
        item._id ||
        item.id;

      const qty = Number(item.qty || item.quantity || 1);

      const product = await Product.findById(productId);
      if (!product || product.isDeleted || !product.isPublished) {
        res.status(400);
        throw new Error(`Product is no longer available`);
      }

      if (item.color) {
        const variant = product.colors.find((c) => c.name === item.color);
        if (variant && variant.stock < qty) {
          res.status(400);
          throw new Error(`Insufficient stock for ${product.name} (Color: ${item.color})`);
        }
      } else if (product.stock < qty) {
        res.status(400);
        throw new Error(`Insufficient stock for ${product.name}`);
      }

      items.push({
        product: product._id,
        name: product.name,
        image: product.coverImage || product.image,
        size: item.size,
        color: item.color,
        qty,
        price: product.price,
      });
    }
  } else {
    const cart = await Cart.findOne({ user: req.user._id }).populate("items.product");
    if (!cart || cart.items.length === 0) {
      res.status(400);
      throw new Error("Cart is empty");
    }

    for (const item of cart.items) {
      const product = item.product;
      if (!product || product.isDeleted || !product.isPublished) {
        res.status(400);
        throw new Error(`Product ${product ? product.name : "Unknown"} is no longer available`);
      }

      if (item.color) {
        const variant = product.colors.find((c) => c.name === item.color);
        if (variant) {
          if (variant.stock < item.qty) {
            res.status(400);
            throw new Error(`Insufficient stock for ${product.name} (Color: ${item.color})`);
          }
        }
      } else if (product.stock < item.qty) {
        res.status(400);
        throw new Error(`Insufficient stock for ${product.name}`);
      }

      items.push({
        product: product._id,
        name: product.name,
        image: product.coverImage || product.image,
        size: item.size,
        color: item.color,
        qty: item.qty,
        price: product.price,
      });
    }
  }

  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
  
  let shipping = 0;
  for (const item of items) {
    const product = await Product.findById(item.product);
    if (product) {
      shipping += (product.shippingCharge || 0) * item.qty;
    }
  }

  const totalAmount = subtotal + shipping;

  const order = await Order.create({
    user: req.user._id,
    items,
    shippingAddress: cleanShippingAddress,
    paymentMethod: "Online",
    paymentStatus: "Pending",
    orderStatus: "Placed",
    subtotal,
    shipping,
    shippingCharge: shipping,
    total: totalAmount,
    totalAmount,
    status: "pending",
    statusHistory: [
      {
        status: "Placed",
        note: "Order payment initialized",
        updatedBy: req.user._id.toString(),
      }
    ]
  });

  const options = {
    amount: Math.round(totalAmount * 100),
    currency: "INR",
    receipt: order._id.toString(),
  };

  try {
    const rzpOrder = await razorpay.orders.create(options);
    order.razorpayOrderId = rzpOrder.id;
    await order.save();

    res.status(201).json({
      key: process.env.RAZORPAY_KEY_ID || "rzp_test_dummy",
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      orderId: rzpOrder.id,
      internalOrderId: order._id,
      user: {
        name: req.user.name,
        email: req.user.email,
      },
    });
  } catch (error) {
    console.error("Razorpay order creation failed:", error);
    order.paymentStatus = "Failed";
    order.paymentFailureReason = error.message || "Razorpay order creation failure";
    await order.save();

    res.status(500);
    throw new Error("Razorpay payment gateway failed to respond. Please try again.");
  }
});

// POST /api/payments/verify
// Protect middleware required
exports.verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, internalOrderId } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !internalOrderId) {
    res.status(400);
    throw new Error("Missing payment verification details");
  }

  const order = await Order.findById(internalOrderId);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (order.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Unauthorized to access this order");
  }

  if (order.paymentStatus === "Paid" || order.paymentStatus === "paid") {
    return res.json({ success: true, message: "Payment already verified", order });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    res.status(500);
    throw new Error("Razorpay secret is not configured on the server");
  }

  const generatedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (generatedSignature !== razorpay_signature) {
    order.paymentStatus = "Failed";
    order.paymentFailureReason = "Signature mismatch verification failed";
    await order.save();

    res.status(400);
    throw new Error("Invalid payment signature. Verification failed.");
  }

  order.paymentStatus = "Paid";
  order.orderStatus = "Placed";
  order.status = "paid";
  order.razorpayPaymentId = razorpay_payment_id;
  order.razorpaySignature = razorpay_signature;
  order.transactionId = razorpay_payment_id;
  order.paidAt = new Date();

  order.statusHistory.push({
    status: "Placed",
    note: `Online payment verified. Transaction: ${razorpay_payment_id}`,
    updatedBy: req.user._id.toString(),
  });

  await order.save();

  await processPaymentCompletion(order, req.user._id);

  res.json({ success: true, message: "Payment verified successfully", order });
});

// Helper function to handle stock deduction and cart clearing
async function processPaymentCompletion(order, userId) {
  try {
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (product) {
        if (item.color) {
          const variant = product.colors.find((c) => c.name === item.color);
          if (variant) {
            variant.stock = Math.max(0, variant.stock - item.qty);
          }
        }
        product.stock = Math.max(0, product.stock - item.qty);
        await product.save();
      }
    }

    await Cart.findOneAndUpdate({ user: userId }, { $set: { items: [] } });
  } catch (error) {
    console.error("Post-payment processing failed:", error);
  }
}

// POST /api/payments/webhook
// Public route - Razorpay webhook
exports.webhook = asyncHandler(async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(200).json({ status: "skipped", message: "No webhook secret set" });
  }

  const signature = req.headers["x-razorpay-signature"];
  if (!signature) {
    return res.status(400).json({ error: "Missing webhook signature" });
  }

  const shasum = crypto.createHmac("sha256", secret);
  shasum.update(JSON.stringify(req.body));
  const digest = shasum.digest("hex");

  if (digest !== signature) {
    return res.status(400).json({ error: "Webhook signature mismatch" });
  }

  const event = req.body.event;
  console.log(`Razorpay Webhook Event Received: ${event}`);

  if (event === "order.paid" || event === "payment.captured") {
    const paymentEntity = req.body.payload.payment.entity;
    const razorpayOrderId = paymentEntity.order_id;
    const razorpayPaymentId = paymentEntity.id;

    const order = await Order.findOne({ razorpayOrderId });
    if (order && order.paymentStatus !== "Paid" && order.paymentStatus !== "paid") {
      order.paymentStatus = "Paid";
      order.orderStatus = "Placed";
      order.status = "paid";
      order.razorpayPaymentId = razorpayPaymentId;
      order.transactionId = razorpayPaymentId;
      order.paidAt = new Date();

      order.statusHistory.push({
        status: "Placed",
        note: `Online payment captured via Webhook. Transaction: ${razorpayPaymentId}`,
        updatedBy: "system",
      });

      await order.save();

      await processPaymentCompletion(order, order.user);
    }
  } else if (event === "payment.failed") {
    const paymentEntity = req.body.payload.payment.entity;
    const razorpayOrderId = paymentEntity.order_id;
    const errorDescription = paymentEntity.error_description || "Payment failed via Razorpay";

    const order = await Order.findOne({ razorpayOrderId });
    if (order && (order.paymentStatus === "Pending" || order.paymentStatus === "pending")) {
      order.paymentStatus = "Failed";
      order.paymentFailureReason = errorDescription;
      await order.save();
    }
  }

  res.json({ status: "ok" });
});

// GET /api/payments/:orderId/status
// Protect middleware required
exports.getPaymentStatus = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (order.user.toString() !== req.user._id.toString() && req.user.role !== "admin" && req.user.role !== "superadmin") {
    res.status(403);
    throw new Error("Unauthorized to access this order status");
  }

  res.json({
    paymentStatus: order.paymentStatus,
    paymentFailureReason: order.paymentFailureReason,
    razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId: order.razorpayPaymentId,
  });
});

// POST /api/payments/:orderId/cancel
exports.cancelPayment = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }
  if (order.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Unauthorized to access this order");
  }
  if (order.paymentStatus === "Pending" || order.paymentStatus === "pending") {
    order.paymentStatus = "Failed";
    order.paymentFailureReason = "Payment cancelled by user";
    order.statusHistory.push({
      status: "Placed",
      note: "Payment cancelled by customer during checkout",
      updatedBy: req.user._id.toString(),
    });
    await order.save();
  }
  res.json({ success: true, order });
});
