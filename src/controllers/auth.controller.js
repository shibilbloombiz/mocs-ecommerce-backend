const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const User = require("../models/User");
const { signToken } = require("../services/jwt.service");

const sanitize = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  avatar: u.avatar,
  phone: u.phone,
  address: u.address,
});

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    if (existingUser.isDeleted) {
      res.status(400);
      throw new Error("Account has been deactivated. Please contact support.");
    }
    res.status(409);
    throw new Error("Email already registered");
  }
  // Force role to user to prevent public admin registration
  const user = await User.create({ name, email, password, role: "user" });
  res.status(201).json({
    user: sanitize(user),
    token: signToken({ id: user._id, role: user.role }),
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password");
  if (!user || user.isDeleted || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error(user && user.isDeleted ? "Account is deactivated" : "Invalid credentials");
  }
  res.json({
    user: sanitize(user),
    token: signToken({ id: user._id, role: user.role }),
  });
});

exports.me = asyncHandler(async (req, res) => res.json({ user: sanitize(req.user) }));

exports.forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.json({ ok: true });
  const raw = crypto.randomBytes(32).toString("hex");
  user.resetToken = crypto.createHash("sha256").update(raw).digest("hex");
  user.resetTokenExpiry = Date.now() + 1000 * 60 * 30;
  await user.save();
  // TODO: send email via nodemailer with link containing `raw`
  res.json({ ok: true, devToken: raw });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    resetToken: hashed,
    resetTokenExpiry: { $gt: Date.now() },
  });
  if (!user) {
    res.status(400);
    throw new Error("Invalid or expired reset token");
  }
  user.password = password;
  user.resetToken = undefined;
  user.resetTokenExpiry = undefined;
  await user.save();
  res.json({ ok: true });
});

exports.logout = (_req, res) => res.clearCookie("token").json({ ok: true });
