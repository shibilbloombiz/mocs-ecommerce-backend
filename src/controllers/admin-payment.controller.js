const asyncHandler = require("express-async-handler");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");

// GET /api/payments
// Require Admin middleware
exports.listPayments = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20, search } = req.query;

  const q = { isDeleted: { $ne: true } };
  if (status) q.paymentStatus = status;

  const skip = (Number(page) - 1) * Number(limit);

  let ordersQuery = Order.find(q).sort("-createdAt").skip(skip).limit(Number(limit)).populate("user", "name email");

  if (search) {
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    }).select("_id");
    
    const userIds = matchingUsers.map(u => u._id);
    
    q.$or = [
      { user: { $in: userIds } },
      { razorpayOrderId: { $regex: search, $options: "i" } },
      { razorpayPaymentId: { $regex: search, $options: "i" } },
    ];
    ordersQuery = Order.find(q).sort("-createdAt").skip(skip).limit(Number(limit)).populate("user", "name email");
  }

  const [items, total] = await Promise.all([
    ordersQuery,
    Order.countDocuments(q),
  ]);

  res.json({
    items,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  });
});

// GET /api/payments/stats
// Require Admin middleware
exports.getStats = asyncHandler(async (req, res) => {
  const totalUsers = await User.countDocuments({ isDeleted: { $ne: true } });
  const totalProducts = await Product.countDocuments({ isDeleted: { $ne: true } });
  const orders = await Order.find({ isDeleted: { $ne: true } }).populate({
    path: "items.product",
    populate: { path: "category" }
  });

  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o => o.status === "pending").length;
  const completedOrders = orders.filter(o => o.status === "delivered").length;
  const totalRevenue = orders
    .filter(o => o.paymentStatus === "paid" || o.paymentMethod === "cod")
    .reduce((sum, o) => sum + o.total, 0);

  const pendingPayments = orders.filter(o => o.paymentStatus === "pending").length;
  const failedPayments = orders.filter(o => o.paymentStatus === "failed").length;

  const recentOrders = await Order.find({ isDeleted: { $ne: true } })
    .sort("-createdAt")
    .limit(5)
    .populate("user", "name email");

  const recentUsers = await User.find({ isDeleted: { $ne: true } })
    .sort("-createdAt")
    .limit(5)
    .select("name email createdAt role");

  const lowStockProducts = await Product.find({ isDeleted: { $ne: true }, stock: { $lte: 5 } })
    .limit(5);

  // Group sales/orders by day for the last 7 days
  const last7Days = [];
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = daysOfWeek[d.getDay()];
    last7Days.push({ d: dateStr, orders: 0, revenue: 0 });
  }

  for (const o of orders) {
    const orderDate = new Date(o.createdAt);
    const dateStr = daysOfWeek[orderDate.getDay()];
    const dayData = last7Days.find(day => day.d === dateStr);
    if (dayData) {
      dayData.orders += 1;
      dayData.revenue += o.total;
    }
  }

  // Compute category split
  const categorySplit = {};
  for (const o of orders) {
    if (o.paymentStatus === "paid" || o.paymentMethod === "cod") {
      for (const item of o.items) {
        if (item.product && item.product.category) {
          const catName = item.product.category.name || "Uncategorized";
          categorySplit[catName] = (categorySplit[catName] || 0) + (item.price * item.qty);
        }
      }
    }
  }

  const categoryRevenue = Object.keys(categorySplit).map(name => ({
    name,
    value: categorySplit[name]
  }));

  const returnRequests = await Order.find({
    isDeleted: { $ne: true },
    status: { $in: ["return_requested", "returned"] }
  })
    .sort("-updatedAt")
    .limit(5)
    .populate("user", "name email")
    .populate({
      path: "items.product",
      select: "name coverImage"
    });

  res.json({
    analytics: {
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenue,
      pendingOrders,
      completedOrders,
      pendingPayments,
      failedPayments,
      categoryRevenue: categoryRevenue.length > 0 ? categoryRevenue : [
        { name: "Men", value: 0 },
        { name: "Women", value: 0 },
        { name: "Kids", value: 0 }
      ],
      salesByDay: last7Days,
    },
    recentOrders,
    recentUsers,
    lowStockProducts,
    returnRequests,
  });
});
