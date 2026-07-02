const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const { verifyToken } = require("../services/jwt.service");

exports.protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.cookies?.token;
  if (!token) {
    res.status(401);
    throw new Error("Not authenticated");
  }
  try {
    const decoded = verifyToken(token);
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) throw new Error("User no longer exists");
    next();
  } catch (e) {
    res.status(401);
    throw new Error("Invalid or expired token");
  }
});

exports.requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    res.status(403);
    throw new Error("Admin access required");
  }
  next();
};
