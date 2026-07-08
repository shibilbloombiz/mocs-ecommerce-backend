const router = require("express").Router();
const ctrl = require("../controllers/order.controller");
const { protect, requireAdmin } = require("../middleware/auth");

router.use(protect);

// User endpoints
router.get("/", ctrl.listMine);
router.post("/", ctrl.create);

// Admin endpoints (MUST be before parameter :id routes to prevent matching "all")
router.get("/all", requireAdmin, ctrl.listAll);

router.get("/:id", ctrl.getById);
router.put("/:id/cancel", ctrl.cancelOrder);
router.patch("/:id/cancel", ctrl.cancelOrder);
router.put("/:id/return", ctrl.returnOrder);
router.put("/:id", requireAdmin, ctrl.updateStatus);
router.patch("/:id/status", requireAdmin, ctrl.updateStatus);
router.patch("/:id/payment-status", requireAdmin, ctrl.updatePaymentStatus);
router.delete("/:id", requireAdmin, ctrl.remove);
router.post("/:id/restore", requireAdmin, ctrl.restore);

module.exports = router;
