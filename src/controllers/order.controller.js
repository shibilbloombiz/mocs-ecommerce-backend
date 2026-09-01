const asyncHandler = require("express-async-handler");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const User = require("../models/User");
const razorpay = require("../services/razorpay.service");

// GET /api/orders
exports.listMine = asyncHandler(async (req, res) => {
  const orders = await Order.find({
    user: req.user._id,
    isDeleted: { $ne: true },
    $nor: [
      {
        paymentMethod: { $regex: /^online$/i },
        paymentStatus: { $in: ["Pending", "pending", "Failed", "failed", "Cancelled", "cancelled"] },
        paidAt: { $exists: false },
      },
    ],
  })
    .sort("-createdAt")
    .populate("items.product");
  res.json(orders);
});

// GET /api/orders/all (Admin only)
exports.listAll = asyncHandler(async (req, res) => {
  const { showDeleted = "false", orderStatus, paymentStatus, paymentMethod } = req.query;
  const q = {};
  if (showDeleted === "true") {
    q.isDeleted = true;
  } else if (showDeleted === "false" || !showDeleted) {
    q.isDeleted = { $ne: true };
    if (!paymentStatus && !orderStatus) {
      q.$nor = [
        {
          paymentMethod: { $regex: /^online$/i },
          paymentStatus: { $in: ["Pending", "pending", "Failed", "failed", "Cancelled", "cancelled"] },
          paidAt: { $exists: false },
        },
      ];
    }
  }

  if (orderStatus) q.orderStatus = orderStatus;
  if (paymentStatus) q.paymentStatus = paymentStatus;
  if (paymentMethod) q.paymentMethod = paymentMethod;

  const orders = await Order.find(q)
    .sort("-createdAt")
    .populate("user", "name email")
    .populate("items.product");
  res.json(orders);
});


// GET /api/orders/:id
exports.getById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate("user", "name email").populate("items.product");
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  const isOwner = order.user._id.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin" || req.user.role === "superadmin";

  if (!isOwner && !isAdmin) {
    res.status(403);
    throw new Error("Not authorized to view this order");
  }

  res.json(order);
});

// POST /api/orders
exports.create = asyncHandler(async (req, res) => {
  const { shippingAddress, paymentMethod } = req.body;
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
        throw new Error("Product is no longer available");
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

    for (const i of cart.items) {
      const product = i.product;
      if (!product || product.isDeleted || !product.isPublished) {
        res.status(400);
        throw new Error(`Product ${product ? product.name : "Unknown"} is no longer available`);
      }

      if (i.color) {
        const variant = product.colors.find((c) => c.name === i.color);
        if (variant && variant.stock < i.qty) {
          res.status(400);
          throw new Error(`Insufficient stock for ${product.name} (Color: ${i.color})`);
        }
      } else if (product.stock < i.qty) {
        res.status(400);
        throw new Error(`Insufficient stock for ${product.name}`);
      }

      items.push({
        product: product._id,
        name: product.name,
        image: product.coverImage || product.image,
        size: i.size,
        color: i.color,
        qty: i.qty,
        price: product.price,
      });
    }

    cart.items = [];
    await cart.save();
  }

  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
  
  let shipping = 0;
  for (const item of items) {
    const product = await Product.findById(item.product);
    if (product) {
      shipping += (product.shippingCharge || 0) * item.qty;
    }
  }

  const total = subtotal + shipping;

  const normalizedMethod = paymentMethod && paymentMethod.toLowerCase() === "cod" ? "COD" : "Online";

  const order = await Order.create({
    user: req.user._id,
    items,
    shippingAddress: cleanShippingAddress,
    paymentMethod: normalizedMethod,
    paymentStatus: "Pending",
    orderStatus: "Placed",
    subtotal,
    shipping,
    shippingCharge: shipping,
    total,
    totalAmount: total,
    status: "pending",
    statusHistory: [
      {
        status: "Placed",
        note: normalizedMethod === "COD" ? "Order placed via Cash on Delivery" : "Order payment initialized",
        updatedBy: req.user._id.toString(),
      }
    ],
  });

  // If Cash on Delivery, deduct stock immediately
  if (order.paymentMethod === "COD") {
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
  }

  res.status(201).json(order);
});

// PATCH /api/orders/:id/status
exports.updateStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  if (!status) {
    res.status(400);
    throw new Error("Status is required");
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  const originalStatus = order.orderStatus;

  // Do not allow Delivered/Return Requested/Return Accepted/Returned order to go back to Processing/Shipped
  const isDelivered = order.orderStatus === "Delivered" || order.status === "delivered";
  const isReturnRequested = order.orderStatus === "Return Requested" || order.status === "return_requested";
  const isReturnAccepted = order.orderStatus === "Return Accepted" || order.status === "return_accepted";
  const isReturned = order.orderStatus === "Returned" || order.status === "returned";

  const targetUpper = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  let formattedTarget = targetUpper;
  if (formattedTarget === "Out for delivery" || formattedTarget === "Out_for_delivery") {
    formattedTarget = "Out for Delivery";
  } else if (formattedTarget === "Return requested" || formattedTarget === "Return_requested") {
    formattedTarget = "Return Requested";
  } else if (formattedTarget === "Return accepted" || formattedTarget === "Return_accepted") {
    formattedTarget = "Return Accepted";
  }

  const isReturnState = ["Return Requested", "Return Accepted", "Returned"].includes(order.orderStatus);
  const targetIsReturnState = ["Return Requested", "Return Accepted", "Returned"].includes(formattedTarget);

  if (targetIsReturnState && !isReturnState) {
    res.status(400);
    throw new Error("Cannot set return status manually unless the customer has initiated a return request");
  }

  if ((isDelivered || isReturnRequested || isReturnAccepted || isReturned) && 
      formattedTarget !== "Returned" && 
      formattedTarget !== "Cancelled" && 
      formattedTarget !== "Return Requested" && 
      formattedTarget !== "Return Accepted" && 
      formattedTarget !== "Delivered") {
    res.status(400);
    throw new Error("Delivered or Returned order cannot go back to processing/shipped status");
  }

  order.orderStatus = formattedTarget;
  
  if (formattedTarget === "Return Requested") {
    order.status = "return_requested";
  } else if (formattedTarget === "Return Accepted") {
    order.status = "return_accepted";
  } else if (formattedTarget === "Out for Delivery") {
    order.status = "out_for_delivery";
  } else {
    order.status = status.toLowerCase();
  }

  if (formattedTarget === "Delivered") {
    order.deliveredAt = new Date();
    if (order.paymentMethod === "COD") {
      order.paymentStatus = "Paid";
      order.paidAt = new Date();
    }
  } else if (formattedTarget === "Cancelled") {
    order.cancelledAt = new Date();
    // Revert inventory if not already cancelled
    if (originalStatus !== "Cancelled") {
      for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (product) {
          if (item.color) {
            const variant = product.colors.find((c) => c.name === item.color);
            if (variant) {
              variant.stock += item.qty;
            }
          }
          product.stock += item.qty;
          await product.save();
        }
      }
    }
  } else if (formattedTarget === "Returned") {
    // Revert inventory if not already returned (refund is handled manually by admin)
    if (originalStatus !== "Returned") {
      for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (product) {
          if (item.color) {
            const variant = product.colors.find((c) => c.name === item.color);
            if (variant) {
              variant.stock += item.qty;
            }
          }
          product.stock += item.qty;
          await product.save();
        }
      }
    }
  }

  order.statusHistory.push({
    status: formattedTarget,
    note: note || `Order status updated to ${formattedTarget} by admin`,
    updatedBy: req.user._id.toString(),
  });

  await order.save();
  res.json(order);
});

// PATCH /api/orders/:id/payment-status
exports.updatePaymentStatus = asyncHandler(async (req, res) => {
  const { paymentStatus } = req.body;
  if (!paymentStatus) {
    res.status(400);
    throw new Error("Payment status is required");
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  // Capitalize
  const formattedPay = paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1).toLowerCase();

  if (formattedPay === "Refunded" && order.orderStatus !== "Returned") {
    res.status(400);
    throw new Error("Can only set payment status to Refunded if the order status is Returned");
  }

  order.paymentStatus = formattedPay;
  if (formattedPay === "Paid") {
    order.paidAt = new Date();
  }

  await order.save();
  res.json(order);
});

// DELETE /api/orders/:id
exports.remove = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  order.isDeleted = true;
  order.deletedAt = new Date();
  await order.save();

  res.json({ success: true, message: "Order archived successfully", order });
});

// POST /api/orders/:id/restore
exports.restore = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  order.isDeleted = false;
  order.deletedAt = undefined;
  await order.save();

  res.json({ success: true, message: "Order restored successfully", order });
});

// PATCH /api/orders/:id/cancel
exports.cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (order.user.toString() !== req.user._id.toString() && req.user.role !== "admin" && req.user.role !== "superadmin") {
    res.status(403);
    throw new Error("Not authorized to cancel this order");
  }

  const currentStat = order.orderStatus || "Placed";
  const disallowed = ["Shipped", "Out for Delivery", "Delivered", "Cancelled", "Returned"];
  if (disallowed.includes(currentStat)) {
    res.status(400);
    throw new Error("Cannot cancel order when status is: " + currentStat);
  }

  order.orderStatus = "Cancelled";
  order.status = "cancelled";
  order.cancelledAt = new Date();
  order.cancelReason = req.body.reason || "Cancelled by user";

  const isOnlineMethod = (order.paymentMethod || "").toLowerCase() === "online" || 
                         (order.paymentMethod || "").toLowerCase() === "upi" || 
                         (order.paymentMethod || "").toLowerCase() === "card" || 
                         (order.paymentMethod || "").toLowerCase() === "prepaid";

  const isOnlineUnpaid = isOnlineMethod && !order.paidAt && order.paymentStatus !== "Paid";
  const isOnlinePaid = isOnlineMethod && (order.paidAt || order.paymentStatus === "Paid");

  if (isOnlineUnpaid) {
    order.isDeleted = true;
    order.deletedAt = new Date();
    order.paymentStatus = "Failed";
    order.paymentFailureReason = req.body.reason || "Cancelled before online payment completion";
    order.statusHistory.push({
      status: "Cancelled",
      note: req.body.reason || "Order cancelled before online payment completion",
      updatedBy: req.user._id.toString(),
    });
  } else if (isOnlinePaid) {
    // Prepaid online cancellation: Requires Admin Approval before refund payout
    const estDate = new Date();
    estDate.setDate(estDate.getDate() + 2);

    order.paymentStatus = "Refund Pending Approval";
    order.refundDetails = {
      refundMethod: "original",
      refundStatus: "Pending Approval",
      refundAmount: order.total,
      refundTransactionId: "",
      refundInitiatedAt: new Date(),
      refundEstimatedDate: estDate,
      adminNotes: "Prepaid order cancelled by customer. Awaiting Admin verification and refund approval.",
    };

    order.statusHistory.push({
      status: "Refund Pending Approval",
      note: `Prepaid online order cancelled by customer. Refund request of ₹${order.total} submitted for Admin approval.`,
      updatedBy: req.user._id.toString(),
    });
  } else {
    // COD or other payment methods
    order.statusHistory.push({
      status: "Cancelled",
      note: req.body.reason || "Order cancelled by user",
      updatedBy: req.user._id.toString(),
    });
  }


  // Revert inventory safely
  if (order.items && Array.isArray(order.items)) {
    for (const item of order.items) {
      if (item && item.product) {
        try {
          const product = await Product.findById(item.product);
          if (product) {
            if (item.color && Array.isArray(product.colors)) {
              const variant = product.colors.find((c) => c && c.name === item.color);
              if (variant && typeof variant.stock === "number") {
                variant.stock += (item.qty || 1);
              }
            }
            if (typeof product.stock === "number") {
              product.stock += (item.qty || 1);
            }
            await product.save();
          }
        } catch (e) {
          console.warn("Could not revert inventory for product:", item.product, e.message);
        }
      }
    }
  }

  await order.save();
  res.json(order);
});

// Helpers for secure masking
const maskAccountNum = (num) => {
  const s = String(num || "").trim().replace(/[^0-9]/g, "");
  if (s.length < 4) return s;
  return `•••• •••• ${s.slice(-4)}`;
};

const maskUpi = (upi) => {
  const s = String(upi || "").trim();
  const parts = s.split("@");
  if (parts.length !== 2) return s;
  const username = parts[0];
  const handle = parts[1];
  if (username.length <= 3) {
    return `${username.slice(0, 1)}***@${handle}`;
  }
  return `${username.slice(0, 3)}***@${handle}`;
};

// PUT /api/orders/:id/return
exports.returnOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate("items.product");
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (order.user.toString() !== req.user._id.toString() && req.user.role !== "admin" && req.user.role !== "superadmin") {
    res.status(403);
    throw new Error("Not authorized to request return for this order");
  }

  const currentStat = order.orderStatus || "";
  if (currentStat !== "Delivered") {
    res.status(400);
    throw new Error("Can only request return for delivered orders");
  }

  // Enforce return window policy
  const deliveryDate = order.deliveredAt ? new Date(order.deliveredAt) : new Date(order.createdAt);
  const now = new Date();
  const diffDays = Math.abs(now.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24);

  let maxDaysAllowed = 3; // default fallback matching schema default
  if (order.items && order.items.length > 0) {
    for (const item of order.items) {
      const product = item.product;
      if (product && typeof product === "object") {
        const promo = product.promo2 || "3-day returns";
        const match = promo.match(/(\d+)-day/i);
        if (match) {
          const days = parseInt(match[1], 10);
          if (days > maxDaysAllowed) {
            maxDaysAllowed = days;
          }
        }
      }
    }
  }

  if (diffDays > maxDaysAllowed) {
    res.status(400);
    throw new Error(`Return window of ${maxDaysAllowed} days has expired`);
  }

  const { reason, refundMethod = "bank", bankDetails, upiDetails, saveAccount = true } = req.body;

  const userDoc = await User.findById(req.user._id);
  const savedMethod = userDoc?.savedRefundMethod || {};

  let validatedBank = null;
  let validatedUpi = null;

  if (refundMethod === "bank") {
    let holder = String(bankDetails?.accountHolderName || "").trim();
    let rawAccount = String(bankDetails?.accountNumber || "").trim();
    let cleanAccount = rawAccount.replace(/[^0-9]/g, "");
    let cleanIfsc = String(bankDetails?.ifscCode || "").trim().toUpperCase();
    let bankName = String(bankDetails?.bankName || "").trim() || "Bank Transfer";

    // If using saved account or account is masked, fall back to saved user details
    if ((cleanAccount.length < 8 || rawAccount.includes("*")) && savedMethod.type === "bank" && savedMethod.accountNumber) {
      cleanAccount = savedMethod.accountNumber;
      holder = holder || savedMethod.accountHolderName;
      cleanIfsc = cleanIfsc || savedMethod.ifscCode;
      bankName = bankName || savedMethod.bankName || "Bank Transfer";
    }

    if (!holder) {
      res.status(400);
      throw new Error("Account holder name is required for bank refund");
    }
    if (cleanAccount.length < 8 || cleanAccount.length > 20) {
      res.status(400);
      throw new Error("Valid bank account number (8-20 digits) is required");
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      res.status(400);
      throw new Error("Valid IFSC code (e.g. HDFC0001234, SBIN0000456) is required");
    }

    validatedBank = {
      accountHolderName: holder,
      accountNumber: cleanAccount,
      ifscCode: cleanIfsc,
      bankName: bankName,
      maskedAccountNumber: maskAccountNum(cleanAccount),
    };

    // Save to user profile for permanent 1-click reuse if requested
    if (saveAccount) {
      await User.findByIdAndUpdate(req.user._id, {
        savedRefundMethod: {
          type: "bank",
          accountHolderName: holder,
          accountNumber: cleanAccount,
          ifscCode: cleanIfsc,
          bankName: bankName,
          maskedAccountNumber: maskAccountNum(cleanAccount),
          upiId: "",
          maskedUpiId: "",
          updatedAt: new Date(),
        },
      });
    }
  } else if (refundMethod === "upi") {
    let cleanUpi = String(upiDetails?.upiId || "").trim().toLowerCase();

    // If using saved account or UPI is masked, fall back to saved user details
    if ((!cleanUpi || cleanUpi.includes("***")) && savedMethod.type === "upi" && savedMethod.upiId) {
      cleanUpi = savedMethod.upiId;
    }

    if (!/^[a-zA-Z0-9.\-_]{2,49}@[a-zA-Z]{2,}$/.test(cleanUpi)) {
      res.status(400);
      throw new Error("Valid UPI ID format (e.g. name@okhdfcbank, mobile@upi) is required");
    }

    validatedUpi = {
      upiId: cleanUpi,
      maskedUpiId: maskUpi(cleanUpi),
    };

    // Save to user profile for permanent 1-click reuse if requested
    if (saveAccount) {
      await User.findByIdAndUpdate(req.user._id, {
        savedRefundMethod: {
          type: "upi",
          accountHolderName: "",
          accountNumber: "",
          ifscCode: "",
          bankName: "",
          maskedAccountNumber: "",
          upiId: cleanUpi,
          maskedUpiId: maskUpi(cleanUpi),
          updatedAt: new Date(),
        },
      });
    }
  } else if (refundMethod === "original") {
    // Refund to original payment method (e.g., razorpay pre-paid card/netbanking)
  } else {
    res.status(400);
    throw new Error("Please select a valid refund payment method (Bank Account, UPI, or Original Payment)");
  }

  // Estimated refund completion date: 1-2 business days for online payments, 2-3 business days for COD from product collection
  const isOnline = (order.paymentMethod || "").toLowerCase() === "online" || 
                   (order.paymentMethod || "").toLowerCase() === "prepaid" || 
                   (order.paymentMethod || "").toLowerCase() === "upi" || 
                   (order.paymentMethod || "").toLowerCase() === "card";
  const estDays = isOnline ? 2 : 3;
  const estDate = new Date();
  estDate.setDate(estDate.getDate() + estDays);

  order.orderStatus = "Return Requested";
  order.status = "return_requested";
  order.returnReason = reason || "Return requested by customer";

  order.refundDetails = {
    refundMethod: refundMethod,
    refundStatus: "Requested",
    bankDetails: validatedBank || undefined,
    upiDetails: validatedUpi || undefined,
    refundAmount: order.total,
    refundInitiatedAt: new Date(),
    refundEstimatedDate: estDate,
    adminNotes: "",
  };

  const refundMethodLabel = refundMethod === "bank" ? "Bank Account Transfer" : refundMethod === "upi" ? "UPI Transfer" : "Original Payment Method";
  const timelineLabel = isOnline ? "1-2 business days after product collection" : "2-3 business days after pickup";

  order.statusHistory.push({
    status: "Return Requested",
    note: `Return requested with ${refundMethodLabel} refund payout. Verification underway (Refund ETA: ${timelineLabel}).`,
    updatedBy: req.user._id.toString(),
  });

  await order.save();
  res.json(order);
});

// PUT /api/orders/:id/refund (Admin only - Process & Complete Refund)
exports.processRefund = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  const { transactionId, utr, adminNotes, refundAmount, refundMethod } = req.body || {};
  const selectedMethod = refundMethod || order.refundDetails?.refundMethod || (order.paymentMethod === "online" ? "original" : "bank");
  const finalAmount = Number(refundAmount) || order.refundDetails?.refundAmount || order.total;

  let gatewayRefundId = null;
  let gatewayRefundNote = "";

  // If Admin approves refund via Gateway (Razorpay) and a real payment ID exists, invoke Razorpay API refund
  if (selectedMethod === "original" && order.razorpayPaymentId && !order.razorpayPaymentId.startsWith("dummy") && !order.razorpayPaymentId.startsWith("test_")) {
    try {
      const rzpRefund = await razorpay.payments.refund(order.razorpayPaymentId, {
        amount: Math.round(finalAmount * 100),
        notes: {
          orderId: order._id.toString(),
          reason: adminNotes || "Admin approved reverse refund to original payment source",
        },
      });
      if (rzpRefund && rzpRefund.id) {
        gatewayRefundId = rzpRefund.id;
        gatewayRefundNote = ` [Razorpay Gateway Ref: ${rzpRefund.id}]`;
      }
    } catch (rzpErr) {
      console.warn("Razorpay API refund notice:", rzpErr.message);
    }
  }

  const finalTxnId = gatewayRefundId || utr || transactionId || `UTR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const previousStatus = order.orderStatus;
  order.orderStatus = "Refunded";
  order.status = "refunded";
  order.paymentStatus = "Refunded";

  if (!order.refundDetails) {
    order.refundDetails = {
      refundMethod: selectedMethod,
      refundStatus: "Refunded",
    };
  }

  order.refundDetails.refundMethod = selectedMethod;
  order.refundDetails.refundStatus = "Refunded";
  order.refundDetails.refundTransactionId = finalTxnId;
  order.refundDetails.refundAmount = finalAmount;
  order.refundDetails.refundCompletedAt = new Date();
  if (adminNotes || gatewayRefundNote) {
    order.refundDetails.adminNotes = (adminNotes || "") + gatewayRefundNote;
  }

  const methodLabel = selectedMethod === "upi"
    ? "UPI"
    : selectedMethod === "bank"
    ? "Bank Transfer"
    : selectedMethod === "manual_online"
    ? "Manual Online Transfer (IMPS/UPI)"
    : "Original Payment Source (Razorpay Reverse)";

  order.statusHistory.push({
    status: "Refunded",
    note: `Refund of ₹${finalAmount} approved and processed to customer's ${methodLabel}. UTR / Ref: ${finalTxnId}${adminNotes ? ` (${adminNotes})` : ""}${gatewayRefundNote}`,
    updatedBy: req.user ? req.user._id.toString() : "admin",
  });

  // Revert inventory upon confirmed return/refund (if not already cancelled/reverted)
  if (order.items && Array.isArray(order.items) && previousStatus !== "Cancelled") {
    for (const item of order.items) {
      if (item && item.product) {
        try {
          const product = await Product.findById(item.product);
          if (product) {
            if (item.color && Array.isArray(product.colors)) {
              const variant = product.colors.find((c) => c && c.name === item.color);
              if (variant && typeof variant.stock === "number") {
                variant.stock += (item.qty || 1);
              }
            }
            if (typeof product.stock === "number") {
              product.stock += (item.qty || 1);
            }
            await product.save();
          }
        } catch (e) {
          console.warn("Could not revert inventory for product on refund:", item.product, e.message);
        }
      }
    }
  }

  await order.save();
  res.json(order);
});

