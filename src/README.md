# MOCS — MERN Reference Scaffold

> Future-migration reference. **Not wired into the Lovable preview** — these files
> are standalone Node.js code for when you deploy a real Express + MongoDB
> backend (Render/Railway + MongoDB Atlas + Cloudinary).

The live MOCS app in `src/` runs on TanStack Start (React + SSR on Cloudflare
Workers) with browser-local state. When you're ready to move to a true MERN
architecture, this folder contains the matching backend.

## Run locally

```bash
cd mern-reference
npm install
cp .env.example .env   # fill MONGO_URI / JWT_SECRET / CLOUDINARY_*
npm run dev
```

Server starts on `http://localhost:5000`. Point the React app at it with
`VITE_API_URL=http://localhost:5000/api` and replace the localStorage helpers
in `src/lib/store.tsx` with axios/fetch calls to the endpoints below.

## REST API

| Resource  | Endpoints                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------- |
| Auth      | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/forgot`, `POST /api/auth/reset` |
| Products  | `GET /api/products`, `GET /api/products/:id`, `POST/PUT/DELETE` (admin), `GET /api/products/related/:id` |
| Cart      | `GET/POST /api/cart`, `PUT/DELETE /api/cart/:id`                                                   |
| Wishlist  | `GET/POST /api/wishlist`, `DELETE /api/wishlist/:id`                                               |
| Reviews   | `GET /api/reviews/:productId`, `POST/PUT/DELETE /api/reviews[/...]`                                |
| Orders    | `GET/POST /api/orders`, `PUT /api/orders/:id` (admin)                                              |

All authenticated routes expect `Authorization: Bearer <jwt>`. Admin-only
routes additionally enforce `role === 'admin'` via `requireAdmin`.
*** Add File: mern-reference/package.json
{
  "name": "mocs-mern-server",
  "version": "1.0.0",
  "description": "MOCS ecommerce backend — Express + MongoDB reference scaffold.",
  "type": "commonjs",
  "main": "server.js",
  "scripts": {
    "dev": "nodemon server.js",
    "start": "node server.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cloudinary": "^2.5.1",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.1",
    "express-async-handler": "^1.2.0",
    "express-rate-limit": "^7.4.1",
    "helmet": "^8.0.0",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.8.1",
    "morgan": "^1.10.0",
    "multer": "^1.4.5-lts.1",
    "multer-storage-cloudinary": "^4.0.0",
    "nodemailer": "^6.9.16",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "nodemon": "^3.1.7"
  }
}
*** Add File: mern-reference/.env.example
PORT=5000
MONGO_URI=mongodb+srv://USER:PASS@cluster0.mongodb.net/mocs
JWT_SECRET=change-this-to-a-long-random-string
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
*** Add File: mern-reference/.gitignore
node_modules
.env
uploads/*
!uploads/.gitkeep
*** Add File: mern-reference/uploads/.gitkeep

*** Add File: mern-reference/server.js
// MOCS — Express bootstrap. Wires middleware, DB, routes, and the error handler.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/error");

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL?.split(",") ?? "*", credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use("/uploads", express.static("uploads"));

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/products", require("./routes/product.routes"));
app.use("/api/cart", require("./routes/cart.routes"));
app.use("/api/wishlist", require("./routes/wishlist.routes"));
app.use("/api/reviews", require("./routes/review.routes"));
app.use("/api/orders", require("./routes/order.routes"));

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
connectDB()
  .then(() => app.listen(PORT, () => console.log(`MOCS API on :${PORT}`)))
  .catch((err) => {
    console.error("DB connection failed", err);
    process.exit(1);
  });
*** Add File: mern-reference/config/db.js
const mongoose = require("mongoose");

module.exports = async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set");
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log("MongoDB connected");
};
*** Add File: mern-reference/config/cloudinary.js
// Cloudinary client + multer storage for product/review/category/user uploads.
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: req.uploadFolder || "mocs/uploads",
    public_id: `${Date.now()}-${file.originalname.replace(/\.[^.]+$/, "")}`,
    resource_type: "image",
  }),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error("Only images allowed"));
    cb(null, true);
  },
});

module.exports = { cloudinary, upload };
*** Add File: mern-reference/services/jwt.service.js
const jwt = require("jsonwebtoken");

exports.signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

exports.verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET);
*** Add File: mern-reference/services/cloudinary.service.js
const { cloudinary } = require("../config/cloudinary");

exports.uploadFromUrl = (url, folder = "mocs/uploads") =>
  cloudinary.uploader.upload(url, { folder });

exports.destroy = (publicId) => cloudinary.uploader.destroy(publicId);
*** Add File: mern-reference/middleware/error.js
exports.notFound = (req, _res, next) => {
  const err = new Error(`Not found - ${req.originalUrl}`);
  err.status = 404;
  next(err);
};

exports.errorHandler = (err, _req, res, _next) => {
  const status = err.status || (res.statusCode === 200 ? 500 : res.statusCode);
  res.status(status).json({
    message: err.message,
    ...(process.env.NODE_ENV === "production" ? {} : { stack: err.stack }),
  });
};
*** Add File: mern-reference/middleware/auth.js
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
  if (req.user?.role !== "admin") {
    res.status(403);
    throw new Error("Admin access required");
  }
  next();
};
*** Add File: mern-reference/middleware/validate.js
module.exports =
  (schema, key = "body") =>
  (req, _res, next) => {
    const result = schema.safeParse(req[key]);
    if (!result.success) {
      const err = new Error(result.error.issues.map((i) => i.message).join(", "));
      err.status = 400;
      return next(err);
    }
    req[key] = result.data;
    next();
  };
*** Add File: mern-reference/models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    avatar: String,
    resetToken: String,
    resetTokenExpiry: Date,
  },
  { timestamps: true },
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("User", userSchema);
*** Add File: mern-reference/models/Category.js
const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    image: String,
    description: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Category", categorySchema);
*** Add File: mern-reference/models/Product.js
const mongoose = require("mongoose");

// Each color variant carries its own gallery (front/side/back/top/sole/lifestyle).
const viewSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      enum: ["Front", "Side", "Back", "Top", "Sole", "Lifestyle"],
      required: true,
    },
    url: { type: String, required: true },
    publicId: String,
  },
  { _id: false },
);

const colorVariantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    hex: { type: String, required: true, match: /^#([0-9a-fA-F]{3}){1,2}$/ },
    images: { type: [viewSchema], default: [] },
    stock: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: "text" },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, required: true },
    brand: { type: String, default: "MOCS" },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    collection: String,
    price: { type: Number, required: true, min: 0 },
    oldPrice: { type: Number, min: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    stock: { type: Number, default: 0, min: 0 },
    colors: { type: [colorVariantSchema], default: [] },
    sizes: { type: [Number], default: [] },
    coverImage: { type: String, required: true },
    isNew: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

productSchema.index({ category: 1, price: 1 });

module.exports = mongoose.model("Product", productSchema);
*** Add File: mern-reference/models/Review.js
const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true, maxlength: 2000 },
    color: String, // color variant — enables color-specific review filtering
    images: [String],
    verifiedPurchase: { type: Boolean, default: false },
    helpfulCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

reviewSchema.index({ product: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("Review", reviewSchema);
*** Add File: mern-reference/models/Cart.js
const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    size: { type: Number, required: true },
    color: { type: String, required: true },
    qty: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: true, timestamps: true },
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: [cartItemSchema],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Cart", cartSchema);
*** Add File: mern-reference/models/Wishlist.js
const mongoose = require("mongoose");

const wishlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Wishlist", wishlistSchema);
*** Add File: mern-reference/models/Order.js
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
      fullName: String,
      line1: String,
      city: String,
      postalCode: String,
      country: String,
    },
    paymentMethod: { type: String, default: "card" },
    subtotal: Number,
    shipping: Number,
    tax: Number,
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "paid", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    paidAt: Date,
    deliveredAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Order", orderSchema);
*** Add File: mern-reference/models/Coupon.js
const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    type: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true, min: 0 },
    minSubtotal: { type: Number, default: 0 },
    expiresAt: Date,
    usageLimit: { type: Number, default: 0 }, // 0 = unlimited
    used: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Coupon", couponSchema);
*** Add File: mern-reference/validators/auth.schema.js
const { z } = require("zod");

exports.registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(120),
});

exports.loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

exports.forgotSchema = z.object({ email: z.string().email() });

exports.resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(120),
});
*** Add File: mern-reference/controllers/auth.controller.js
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
});

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.findOne({ email })) {
    res.status(409);
    throw new Error("Email already registered");
  }
  const user = await User.create({ name, email, password });
  res.status(201).json({
    user: sanitize(user),
    token: signToken({ id: user._id, role: user.role }),
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error("Invalid credentials");
  }
  res.json({
    user: sanitize(user),
    token: signToken({ id: user._id, role: user.role }),
  });
});

exports.me = asyncHandler(async (req, res) => res.json({ user: sanitize(req.user) }));

exports.forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.json({ ok: true }); // do not leak existence
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
*** Add File: mern-reference/controllers/product.controller.js
const asyncHandler = require("express-async-handler");
const Product = require("../models/Product");

// GET /api/products?search=&category=&color=&size=&minPrice=&maxPrice=&sort=&page=&limit=
exports.list = asyncHandler(async (req, res) => {
  const {
    search,
    category,
    color,
    size,
    minPrice,
    maxPrice,
    sort = "-createdAt",
    page = 1,
    limit = 24,
  } = req.query;

  const q = { isPublished: true };
  if (search) q.$text = { $search: search };
  if (category) q.category = category;
  if (color) q["colors.name"] = color;
  if (size) q.sizes = Number(size);
  if (minPrice || maxPrice) {
    q.price = {};
    if (minPrice) q.price.$gte = Number(minPrice);
    if (maxPrice) q.price.$lte = Number(maxPrice);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Product.find(q).sort(sort).skip(skip).limit(Number(limit)).populate("category"),
    Product.countDocuments(q),
  ]);
  res.json({ items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

exports.get = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate("category");
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }
  res.json(product);
});

exports.related = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }
  const items = await Product.find({
    _id: { $ne: product._id },
    category: product.category,
    isPublished: true,
  }).limit(8);
  res.json(items);
});

exports.create = asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json(product);
});

exports.update = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }
  res.json(product);
});

exports.remove = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }
  res.json({ ok: true });
});

// POST /api/products/:id/images   (admin, multipart)
exports.uploadImages = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }
  const variant = product.colors.find((c) => c.name === req.body.color);
  if (!variant) {
    res.status(400);
    throw new Error("Color variant not found");
  }
  for (const f of req.files || []) {
    variant.images.push({
      label: req.body.label || "Front",
      url: f.path,
      publicId: f.filename,
    });
  }
  await product.save();
  res.status(201).json(product);
});
*** Add File: mern-reference/controllers/cart.controller.js
const asyncHandler = require("express-async-handler");
const Cart = require("../models/Cart");

exports.get = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).populate("items.product");
  res.json(cart || { user: req.user._id, items: [] });
});

exports.add = asyncHandler(async (req, res) => {
  const { productId, size, color, qty = 1 } = req.body;
  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });

  const existing = cart.items.find(
    (i) => i.product.toString() === productId && i.size === size && i.color === color,
  );
  if (existing) existing.qty += qty;
  else cart.items.push({ product: productId, size, color, qty });

  await cart.save();
  res.status(201).json(await cart.populate("items.product"));
});

exports.updateItem = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  const item = cart?.items.id(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Item not found");
  }
  item.qty = Math.max(1, Number(req.body.qty));
  await cart.save();
  res.json(await cart.populate("items.product"));
});

exports.removeItem = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  const item = cart?.items.id(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Item not found");
  }
  item.deleteOne();
  await cart.save();
  res.json(await cart.populate("items.product"));
});
*** Add File: mern-reference/controllers/wishlist.controller.js
const asyncHandler = require("express-async-handler");
const Wishlist = require("../models/Wishlist");

exports.get = asyncHandler(async (req, res) => {
  const wl = await Wishlist.findOne({ user: req.user._id }).populate("products");
  res.json(wl || { user: req.user._id, products: [] });
});

exports.add = asyncHandler(async (req, res) => {
  const wl = await Wishlist.findOneAndUpdate(
    { user: req.user._id },
    { $addToSet: { products: req.body.productId } },
    { upsert: true, new: true },
  ).populate("products");
  res.status(201).json(wl);
});

exports.remove = asyncHandler(async (req, res) => {
  const wl = await Wishlist.findOneAndUpdate(
    { user: req.user._id },
    { $pull: { products: req.params.id } },
    { new: true },
  ).populate("products");
  res.json(wl);
});
*** Add File: mern-reference/controllers/review.controller.js
const asyncHandler = require("express-async-handler");
const Review = require("../models/Review");
const Product = require("../models/Product");

const recalcRating = async (productId) => {
  const stats = await Review.aggregate([
    { $match: { product: productId } },
    { $group: { _id: "$product", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = stats[0] || {};
  await Product.findByIdAndUpdate(productId, { rating: avg, reviewCount: count });
};

// GET /api/reviews/:productId?color=
exports.list = asyncHandler(async (req, res) => {
  const q = { product: req.params.productId };
  if (req.query.color) q.color = req.query.color;
  const items = await Review.find(q).sort("-createdAt").populate("user", "name avatar");
  res.json(items);
});

exports.create = asyncHandler(async (req, res) => {
  const { product, rating, text, color, images } = req.body;
  const review = await Review.create({
    product,
    rating,
    text,
    color,
    images,
    user: req.user._id,
    verifiedPurchase: true, // TODO: check order history
  });
  await recalcRating(product);
  res.status(201).json(review);
});

exports.update = asyncHandler(async (req, res) => {
  const review = await Review.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    req.body,
    { new: true, runValidators: true },
  );
  if (!review) {
    res.status(404);
    throw new Error("Review not found");
  }
  await recalcRating(review.product);
  res.json(review);
});

exports.remove = asyncHandler(async (req, res) => {
  const review = await Review.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!review) {
    res.status(404);
    throw new Error("Review not found");
  }
  await recalcRating(review.product);
  res.json({ ok: true });
});

exports.helpful = asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { $inc: { helpfulCount: 1 } },
    { new: true },
  );
  res.json(review);
});
*** Add File: mern-reference/controllers/order.controller.js
const asyncHandler = require("express-async-handler");
const Order = require("../models/Order");
const Cart = require("../models/Cart");

exports.listMine = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort("-createdAt");
  res.json(orders);
});

exports.listAll = asyncHandler(async (_req, res) => {
  const orders = await Order.find().sort("-createdAt").populate("user", "name email");
  res.json(orders);
});

exports.create = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).populate("items.product");
  if (!cart || cart.items.length === 0) {
    res.status(400);
    throw new Error("Cart is empty");
  }
  const subtotal = cart.items.reduce((n, i) => n + i.product.price * i.qty, 0);
  const shipping = subtotal >= 150 ? 0 : 12;
  const order = await Order.create({
    user: req.user._id,
    items: cart.items.map((i) => ({
      product: i.product._id,
      name: i.product.name,
      image: i.product.coverImage,
      size: i.size,
      color: i.color,
      qty: i.qty,
      price: i.product.price,
    })),
    shippingAddress: req.body.shippingAddress,
    paymentMethod: req.body.paymentMethod,
    subtotal,
    shipping,
    total: subtotal + shipping,
  });
  cart.items = [];
  await cart.save();
  res.status(201).json(order);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    {
      status: req.body.status,
      ...(req.body.status === "delivered" && { deliveredAt: new Date() }),
    },
    { new: true },
  );
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }
  res.json(order);
});
*** Add File: mern-reference/routes/auth.routes.js
const router = require("express").Router();
const ctrl = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth");
const validate = require("../middleware/validate");
const {
  registerSchema,
  loginSchema,
  forgotSchema,
  resetSchema,
} = require("../validators/auth.schema");

router.post("/register", validate(registerSchema), ctrl.register);
router.post("/login", validate(loginSchema), ctrl.login);
router.get("/me", protect, ctrl.me);
router.post("/forgot", validate(forgotSchema), ctrl.forgotPassword);
router.post("/reset", validate(resetSchema), ctrl.resetPassword);
router.post("/logout", ctrl.logout);

module.exports = router;
*** Add File: mern-reference/routes/product.routes.js
const router = require("express").Router();
const ctrl = require("../controllers/product.controller");
const { protect, requireAdmin } = require("../middleware/auth");
const { upload } = require("../config/cloudinary");

router.get("/", ctrl.list);
router.get("/related/:id", ctrl.related);
router.get("/:id", ctrl.get);

router.use(protect, requireAdmin);
router.post("/", ctrl.create);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);
router.post(
  "/:id/images",
  (req, _res, next) => {
    req.uploadFolder = `mocs/products/${req.params.id}`;
    next();
  },
  upload.array("images", 8),
  ctrl.uploadImages,
);

module.exports = router;
*** Add File: mern-reference/routes/cart.routes.js
const router = require("express").Router();
const ctrl = require("../controllers/cart.controller");
const { protect } = require("../middleware/auth");

router.use(protect);
router.get("/", ctrl.get);
router.post("/", ctrl.add);
router.put("/:id", ctrl.updateItem);
router.delete("/:id", ctrl.removeItem);

module.exports = router;
*** Add File: mern-reference/routes/wishlist.routes.js
const router = require("express").Router();
const ctrl = require("../controllers/wishlist.controller");
const { protect } = require("../middleware/auth");

router.use(protect);
router.get("/", ctrl.get);
router.post("/", ctrl.add);
router.delete("/:id", ctrl.remove);

module.exports = router;
*** Add File: mern-reference/routes/review.routes.js
const router = require("express").Router();
const ctrl = require("../controllers/review.controller");
const { protect } = require("../middleware/auth");

router.get("/:productId", ctrl.list);
router.post("/:id/helpful", ctrl.helpful);

router.use(protect);
router.post("/", ctrl.create);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
*** Add File: mern-reference/routes/order.routes.js
const router = require("express").Router();
const ctrl = require("../controllers/order.controller");
const { protect, requireAdmin } = require("../middleware/auth");

router.use(protect);
router.get("/", ctrl.listMine);
router.post("/", ctrl.create);
router.get("/all", requireAdmin, ctrl.listAll);
router.put("/:id", requireAdmin, ctrl.updateStatus);

module.exports = router;