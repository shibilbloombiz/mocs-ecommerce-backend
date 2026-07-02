const router = require("express").Router();
const ctrl = require("../controllers/cart.controller");
const { protect } = require("../middleware/auth");

router.use(protect);
router.get("/", ctrl.get);
router.post("/", ctrl.add);
router.put("/:id", ctrl.updateItem);
router.delete("/:id", ctrl.removeItem);

module.exports = router;
