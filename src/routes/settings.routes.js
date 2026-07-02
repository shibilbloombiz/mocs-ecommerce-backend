const router = require("express").Router();
const ctrl = require("../controllers/settings.controller");
const { protect, requireAdmin } = require("../middleware/auth");

router.get("/:key", ctrl.getSettings);
router.put("/:key", protect, requireAdmin, ctrl.updateSettings);

module.exports = router;
