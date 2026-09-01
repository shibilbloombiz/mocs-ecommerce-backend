const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

// GET /api/users/profile
exports.getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.isDeleted) {
    res.status(404);
    throw new Error("User profile not found");
  }
  res.json({
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    address: user.address || "",
    role: user.role,
    jobTitle: user.jobTitle || "",
    savedRefundMethod: user.savedRefundMethod || { type: "none" },
    createdAt: user.createdAt,
  });
});

// Helper for secure masking
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

// GET /api/users/refund-account
exports.getRefundAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.isDeleted) {
    res.status(404);
    throw new Error("User not found");
  }

  const refundMethod = user.savedRefundMethod || { type: "none" };
  res.json({
    type: refundMethod.type || "none",
    accountHolderName: refundMethod.accountHolderName || "",
    bankName: refundMethod.bankName || "",
    ifscCode: refundMethod.ifscCode || "",
    maskedAccountNumber: refundMethod.maskedAccountNumber || maskAccountNum(refundMethod.accountNumber),
    maskedUpiId: refundMethod.maskedUpiId || maskUpi(refundMethod.upiId),
    upiId: refundMethod.upiId || "",
    updatedAt: refundMethod.updatedAt,
  });
});

// PUT /api/users/refund-account
exports.updateRefundAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.isDeleted) {
    res.status(404);
    throw new Error("User not found");
  }

  const { type, accountHolderName, accountNumber, ifscCode, bankName, upiId } = req.body;

  if (!type || !["bank", "upi", "none"].includes(type)) {
    res.status(400);
    throw new Error("Valid refund method type (bank, upi, none) is required");
  }

  if (type === "bank") {
    const cleanAccount = String(accountNumber || "").replace(/[^0-9]/g, "");
    const cleanIfsc = String(ifscCode || "").trim().toUpperCase();
    const holder = String(accountHolderName || "").trim();
    const bank = String(bankName || "").trim();

    if (!holder) {
      res.status(400);
      throw new Error("Account holder name is required");
    }
    if (cleanAccount.length < 8 || cleanAccount.length > 20) {
      res.status(400);
      throw new Error("Bank account number must be between 8 and 20 digits");
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      res.status(400);
      throw new Error("Invalid IFSC code format (e.g., HDFC0001234, SBIN0000456)");
    }

    user.savedRefundMethod = {
      type: "bank",
      accountHolderName: holder,
      accountNumber: cleanAccount,
      ifscCode: cleanIfsc,
      bankName: bank || "Bank Transfer",
      maskedAccountNumber: maskAccountNum(cleanAccount),
      upiId: "",
      maskedUpiId: "",
      updatedAt: new Date(),
    };
  } else if (type === "upi") {
    const cleanUpi = String(upiId || "").trim().toLowerCase();
    if (!/^[a-zA-Z0-9.\-_]{2,49}@[a-zA-Z]{2,}$/.test(cleanUpi)) {
      res.status(400);
      throw new Error("Invalid UPI ID format (e.g., username@bank, mobile@upi)");
    }

    user.savedRefundMethod = {
      type: "upi",
      accountHolderName: "",
      accountNumber: "",
      ifscCode: "",
      bankName: "",
      maskedAccountNumber: "",
      upiId: cleanUpi,
      maskedUpiId: maskUpi(cleanUpi),
      updatedAt: new Date(),
    };
  } else {
    user.savedRefundMethod = {
      type: "none",
      accountHolderName: "",
      accountNumber: "",
      ifscCode: "",
      bankName: "",
      maskedAccountNumber: "",
      upiId: "",
      maskedUpiId: "",
      updatedAt: new Date(),
    };
  }

  await user.save();

  res.json({
    success: true,
    message: "Refund payout details saved securely",
    refundAccount: {
      type: user.savedRefundMethod.type,
      accountHolderName: user.savedRefundMethod.accountHolderName,
      bankName: user.savedRefundMethod.bankName,
      ifscCode: user.savedRefundMethod.ifscCode,
      maskedAccountNumber: user.savedRefundMethod.maskedAccountNumber,
      maskedUpiId: user.savedRefundMethod.maskedUpiId,
      updatedAt: user.savedRefundMethod.updatedAt,
    },
  });
});


// PUT /api/users/profile
exports.updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.isDeleted) {
    res.status(404);
    throw new Error("User profile not found");
  }

  user.name = req.body.name || user.name;
  
  if (req.body.phone !== undefined && req.body.phone !== "") {
    const cleanPhone = String(req.body.phone).replace(/[^0-9]/g, "");
    if (cleanPhone.length !== 10 || String(req.body.phone) !== cleanPhone) {
      res.status(400);
      throw new Error("Phone number must be exactly 10 digits and contain only numbers");
    }
    user.phone = cleanPhone;
  } else if (req.body.phone === "") {
    user.phone = "";
  }

  user.address = req.body.address !== undefined ? req.body.address : user.address;
  user.jobTitle = req.body.jobTitle !== undefined ? req.body.jobTitle : user.jobTitle;

  const updatedUser = await user.save();

  res.json({
    id: updatedUser._id,
    name: updatedUser.name,
    email: updatedUser.email,
    phone: updatedUser.phone || "",
    address: updatedUser.address || "",
    role: updatedUser.role,
    jobTitle: updatedUser.jobTitle || "",
    createdAt: updatedUser.createdAt,
  });
});

// PUT /api/users/change-password
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400);
    throw new Error("Both current and new passwords are required");
  }

  const user = await User.findById(req.user._id).select("+password");
  if (!user || user.isDeleted) {
    res.status(404);
    throw new Error("User not found");
  }

  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    res.status(401);
    throw new Error("Incorrect current password");
  }

  if (newPassword.length < 8) {
    res.status(400);
    throw new Error("New password must be at least 8 characters long");
  }

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: "Password updated successfully" });
});

// GET /api/users (Admin only)
exports.listUsers = asyncHandler(async (req, res) => {
  const { role, showDeleted = "false", page = 1, limit = 20, search } = req.query;

  const q = {};
  
  if (showDeleted === "true") {
    q.isDeleted = true;
  } else if (showDeleted === "false") {
    q.isDeleted = { $ne: true };
  } // else return both if showDeleted is "all"

  if (role) {
    q.role = role;
  }

  if (search) {
    q.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    User.find(q).sort("-createdAt").skip(skip).limit(Number(limit)),
    User.countDocuments(q),
  ]);

  res.json({
    items: items.map(u => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone || "",
      address: u.address || "",
      isDeleted: u.isDeleted,
      deletedAt: u.deletedAt,
      createdAt: u.createdAt,
    })),
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  });
});

// PUT /api/users/:id (Admin only)
exports.updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Prevent changing role of superadmin if logged user is not superadmin
  if (user.role === "superadmin" && req.user.role !== "superadmin") {
    res.status(403);
    throw new Error("Only a superadmin can modify superadmin settings");
  }

  user.name = req.body.name || user.name;
  user.email = req.body.email || user.email;
  user.role = req.body.role || user.role;
  
  if (req.body.phone !== undefined && req.body.phone !== "") {
    const cleanPhone = String(req.body.phone).replace(/[^0-9]/g, "");
    if (cleanPhone.length !== 10 || String(req.body.phone) !== cleanPhone) {
      res.status(400);
      throw new Error("Phone number must be exactly 10 digits and contain only numbers");
    }
    user.phone = cleanPhone;
  } else if (req.body.phone === "") {
    user.phone = "";
  }

  user.address = req.body.address !== undefined ? req.body.address : user.address;

  const updatedUser = await user.save();

  res.json({
    _id: updatedUser._id,
    name: updatedUser.name,
    email: updatedUser.email,
    role: updatedUser.role,
    phone: updatedUser.phone || "",
    address: updatedUser.address || "",
    isDeleted: updatedUser.isDeleted,
    createdAt: updatedUser.createdAt,
  });
});

// DELETE /api/users/:id (Admin only - Soft Delete)
exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Prevent deleting superadmin
  if (user.role === "superadmin") {
    res.status(400);
    throw new Error("Superadmin account cannot be soft-deleted");
  }

  // Prevent self deletion
  if (user._id.toString() === req.user._id.toString()) {
    res.status(400);
    throw new Error("You cannot delete your own account");
  }

  user.isDeleted = true;
  user.deletedAt = new Date();
  await user.save();

  res.json({ success: true, message: "User soft-deleted successfully", user });
});

// POST /api/users/:id/restore (Admin only)
exports.restoreUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  user.isDeleted = false;
  user.deletedAt = undefined;
  await user.save();

  res.json({ success: true, message: "User restored successfully", user });
});

// POST /api/users (Admin only - Create Staff/User)
exports.createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role = "user", phone, address } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Name, email, and password are required");
  }

  // Only superadmin can create accounts with "admin" or "superadmin" role
  if ((role === "admin" || role === "superadmin") && req.user.role !== "superadmin") {
    res.status(403);
    throw new Error("Only superadmins can create admin accounts");
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists with this email");
  }

  const user = await User.create({
    name,
    email,
    password,
    role,
    phone,
    address
  });

  res.status(201).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || "",
    address: user.address || "",
    isDeleted: user.isDeleted,
    createdAt: user.createdAt,
  });
});
