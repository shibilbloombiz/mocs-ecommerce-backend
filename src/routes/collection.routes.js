const router = require("express").Router();
const ctrl = require("../controllers/collection.controller");
const { protect, requireAdmin } = require("../middleware/auth");

router.get("/", ctrl.list);
router.post("/", protect, requireAdmin, ctrl.create);
router.delete("/:id", protect, requireAdmin, ctrl.remove);

module.exports = router;
