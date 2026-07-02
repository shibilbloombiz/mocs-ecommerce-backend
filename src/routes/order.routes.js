const router = require("express").Router();
const ctrl = require("../controllers/order.controller");
const { protect, requireAdmin } = require("../middleware/auth");

router.use(protect);
router.get("/", ctrl.listMine);
router.post("/", ctrl.create);
router.put("/:id/cancel", ctrl.cancelOrder);
router.put("/:id/return", ctrl.returnOrder);

router.get("/all", requireAdmin, ctrl.listAll);
router.put("/:id", requireAdmin, ctrl.updateStatus);
router.delete("/:id", requireAdmin, ctrl.remove);
router.post("/:id/restore", requireAdmin, ctrl.restore);

module.exports = router;
