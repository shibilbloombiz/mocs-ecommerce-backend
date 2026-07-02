// MOCS — Express bootstrap. Wires middleware, DB, routes, and the error handler.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const path = require("path");

const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/error");

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
const allowedOrigins = process.env.CLIENT_URL?.split(",") ?? [];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const isLocalhost =
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin === "http://localhost" ||
        origin === "http://127.0.0.1";
      if (
        isLocalhost ||
        allowedOrigins.includes(origin) ||
        allowedOrigins.length === 0 ||
        allowedOrigins.includes("*")
      ) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  })
);
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
