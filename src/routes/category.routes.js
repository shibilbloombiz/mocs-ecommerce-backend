const router = require("express").Router();
const ctrl = require("../controllers/category.controller");
const { protect, requireAdmin } = require("../middleware/auth");

router.get("/", ctrl.list);
router.post("/", protect, requireAdmin, ctrl.create);

module.exports = router;
