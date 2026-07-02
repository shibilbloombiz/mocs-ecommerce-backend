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
