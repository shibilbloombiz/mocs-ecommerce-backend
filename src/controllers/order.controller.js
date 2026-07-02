const asyncHandler = require("express-async-handler");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");

// GET /api/orders
exports.listMine = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort("-createdAt");
  res.json(orders);
});

// GET /api/orders/all (Admin only)
exports.listAll = asyncHandler(async (req, res) => {
  const { showDeleted = "false" } = req.query;
  const q = {};
  if (showDeleted === "true") {
    q.isDeleted = true;
  } else if (showDeleted === "false") {
    q.isDeleted = { $ne: true };
  }

  const orders = await Order.find(q).sort("-createdAt").populate("user", "name email");
  res.json(orders);
});

// POST /api/orders
exports.create = asyncHandler(async (req, res) => {
  const { shippingAddress, paymentMethod } = req.body;
  if (!shippingAddress) {
    res.status(400);
    throw new Error("Shipping address is required");
  }

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
        if (variant) {
          if (variant.stock < i.qty) {
            res.status(400);
            throw new Error(`Insufficient stock for ${product.name} (Color: ${i.color})`);
          }
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

  const order = await Order.create({
    user: req.user._id,
    items,
    shippingAddress,
    paymentMethod: paymentMethod || "cod",
    paymentStatus: paymentMethod === "cod" ? "pending" : "pending",
    subtotal,
    shipping,
    total,
    status: "pending",
  });

  // If Cash on Delivery, deduct stock immediately
  if (order.paymentMethod === "cod") {
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

// PUT /api/orders/:id
exports.updateStatus = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    {
      status: req.body.status,
      ...(req.body.status === "delivered" && { deliveredAt: new Date(), paymentStatus: "paid" }), // COD orders get paid on delivery
    },
    { new: true },
  );
  if (!order) { res.status(404); throw new Error("Order not found"); }
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

// PUT /api/orders/:id/cancel
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

  if (order.status === "shipped" || order.status === "delivered" || order.status === "cancelled") {
    res.status(400);
    throw new Error("Cannot cancel this order (status: " + order.status + ")");
  }

  order.status = "cancelled";
  order.cancelReason = req.body.reason || "Cancelled";

  // Revert inventory
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

  await order.save();
  res.json(order);
});

// PUT /api/orders/:id/return
exports.returnOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (order.user.toString() !== req.user._id.toString() && req.user.role !== "admin" && req.user.role !== "superadmin") {
    res.status(403);
    throw new Error("Not authorized to request return for this order");
  }

  if (order.status !== "delivered") {
    res.status(400);
    throw new Error("Can only request return for delivered orders");
  }

  order.status = "return_requested";
  order.returnReason = req.body.reason || "No reason provided";
  await order.save();

  res.json(order);
});
