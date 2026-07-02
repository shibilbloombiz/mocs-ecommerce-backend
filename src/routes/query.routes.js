const router = require("express").Router();
const ctrl = require("../controllers/query.controller");
const { protect, requireAdmin } = require("../middleware/auth");

// Public endpoints
router.post("/", ctrl.create);

// Admin-only endpoints
router.get("/", protect, requireAdmin, ctrl.list);
router.put("/:id", protect, requireAdmin, ctrl.update);
router.delete("/:id", protect, requireAdmin, ctrl.remove);
router.post("/:id/restore", protect, requireAdmin, ctrl.restore);

module.exports = router;
