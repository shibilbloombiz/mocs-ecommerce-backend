const path = require("path");
require("dotenv").config();
if (!process.env.MONGO_URI) {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/error");


const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
const allowedOrigins = (process.env.CLIENT_URL?.split(",") ?? [])
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/$/, "");
      const isLocalhost =
        cleanOrigin.startsWith("http://localhost:") ||
        cleanOrigin.startsWith("http://127.0.0.1:") ||
        cleanOrigin === "http://localhost" ||
        cleanOrigin === "http://127.0.0.1";
      const isVercel = cleanOrigin.endsWith(".vercel.app");

      if (
        isLocalhost ||
        isVercel ||
        allowedOrigins.includes(cleanOrigin) ||
        allowedOrigins.length === 0 ||
        allowedOrigins.includes("*")
      ) {
        callback(null, true);
      } else {
        console.warn(`Blocked by CORS: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie", "X-Requested-With"],
  })
);
app.options("*", cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/products", require("./routes/product.routes"));
app.use("/api/cart", require("./routes/cart.routes"));
app.use("/api/wishlist", require("./routes/wishlist.routes"));
app.use("/api/reviews", require("./routes/review.routes"));
app.use("/api/orders", require("./routes/order.routes"));
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/payments", require("./routes/payment.routes"));
app.use("/api/queries", require("./routes/query.routes"));
app.use("/api/settings", require("./routes/settings.routes"));
app.use("/api/categories", require("./routes/category.routes"));
app.use("/api/collections", require("./routes/collection.routes"));

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
connectDB()
  .then(() => app.listen(PORT, () => console.log(`MOCS API on :${PORT}`)))
  .catch((err) => {
    console.error("DB connection failed", err);
    process.exit(1);
  });
