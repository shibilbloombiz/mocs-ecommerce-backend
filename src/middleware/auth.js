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

function capitalizeStrings(obj) {
  if (!obj || typeof obj !== "object") return;
  
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === "string") {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("id") ||
        lowerKey.includes("url") ||
        lowerKey.includes("image") ||
        lowerKey.includes("email") ||
        lowerKey.includes("status") ||
        lowerKey.includes("role") ||
        lowerKey.includes("key") ||
        lowerKey.includes("slug") ||
        lowerKey.includes("hex") ||
        lowerKey.includes("logo") ||
        lowerKey.includes("token")
      ) {
        continue;
      }
      
      if (/^[0-9a-fA-F]{24}$/.test(value)) {
        continue;
      }
      
      if (
        value.startsWith("http://") ||
        value.startsWith("https://") ||
        value.startsWith("data:") ||
        value.includes("@")
      ) {
        continue;
      }
      
      if (value.length > 0 && /[a-z]/.test(value.charAt(0))) {
        obj[key] = value.charAt(0).toUpperCase() + value.slice(1);
      }
    } else if (typeof value === "object") {
      capitalizeStrings(value);
    }
  }
}

exports.requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
    res.status(403);
    throw new Error("Admin access required");
  }
  
  if (req.body) {
    capitalizeStrings(req.body);
  }
  
  next();
};
