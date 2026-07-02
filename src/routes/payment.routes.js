const router = require("express").Router();
const ctrl = require("../controllers/payment.controller");
const adminCtrl = require("../controllers/admin-payment.controller");
const { protect, requireAdmin } = require("../middleware/auth");

// Public webhook route (requires raw or parsed body signature check)
router.post("/webhook", ctrl.webhook);

// Protected routes (require user login)
router.use(protect);
router.post("/create-order", ctrl.createOrder);
router.post("/verify", ctrl.verifyPayment);
router.get("/:orderId/status", ctrl.getPaymentStatus);

// Admin-only routes
router.get("/", requireAdmin, adminCtrl.listPayments);
router.get("/stats", requireAdmin, adminCtrl.getStats);

module.exports = router;
