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

exports.clerkSync = asyncHandler(async (req, res) => {
  const { email, name, clerkId, avatar, mode } = req.body;
  if (!email) {
    res.status(400);
    throw new Error("Email is required for Clerk sync");
  }

  const normalizedEmail = email.toLowerCase().trim();
  let user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    if (mode === "login") {
      res.status(404);
      throw new Error(`No account found with ${normalizedEmail}. Please sign up first to create an account.`);
    }

    const randomPassword = crypto.randomBytes(16).toString("hex");
    user = await User.create({
      name: name || "Google User",
      email: normalizedEmail,
      password: randomPassword,
      clerkId: clerkId,
      avatar: avatar || "",
      role: "user"
    });
  } else {
    let updated = false;
    if (!user.clerkId) {
      user.clerkId = clerkId;
      updated = true;
    }
    if (avatar && user.avatar !== avatar) {
      user.avatar = avatar;
      updated = true;
    }
    if (name && (!user.name || user.name === "Guest User")) {
      user.name = name;
      updated = true;
    }
    if (updated) {
      await user.save();
    }
  }

  res.json({
    user: sanitize(user),
    token: signToken({ id: user._id, role: user.role }),
  });
});

exports.googleAuth = asyncHandler(async (req, res) => {
  const { idToken, mode } = req.body;
  if (!idToken) {
    res.status(400);
    throw new Error("Google ID token is required");
  }

  // Verify the ID token with Google's tokeninfo endpoint
  const googleRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );

  if (!googleRes.ok) {
    res.status(401);
    throw new Error("Invalid Google token");
  }

  const payload = await googleRes.json();

  if (!payload.email_verified || payload.email_verified === "false") {
    res.status(401);
    throw new Error("Google account email is not verified");
  }

  const { email, name, sub: googleId, picture: avatar } = payload;
  const normalizedEmail = email.toLowerCase().trim();

  // Find existing user by googleId or email
  let user = await User.findOne({ $or: [{ googleId }, { email: normalizedEmail }] });

  if (!user) {
    if (mode === "login") {
      res.status(404);
      throw new Error(`No account found for ${normalizedEmail}. Please sign up first to create your account.`);
    }

    // Create new Google user
    user = await User.create({
      name: name || "Google User",
      email: normalizedEmail,
      googleId,
      avatar: avatar || "",
      authProvider: "google",
      role: "user",
    });
  } else {
    // Merge Google info into existing user
    let updated = false;
    if (!user.googleId) { user.googleId = googleId; updated = true; }
    if (!user.authProvider || user.authProvider === "local") {
      user.authProvider = "google"; updated = true;
    }
    if (avatar && user.avatar !== avatar) { user.avatar = avatar; updated = true; }
    if (updated) await user.save();
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
