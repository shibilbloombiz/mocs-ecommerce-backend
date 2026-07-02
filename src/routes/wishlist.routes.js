const router = require("express").Router();
const ctrl = require("../controllers/wishlist.controller");
const { protect } = require("../middleware/auth");

router.use(protect);
router.get("/", ctrl.get);
router.post("/", ctrl.add);
router.delete("/:id", ctrl.remove);

module.exports = router;
