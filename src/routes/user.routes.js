const router = require("express").Router();
const ctrl = require("../controllers/user.controller");
const { protect, requireAdmin } = require("../middleware/auth");

router.use(protect);

// Customer endpoints
router.get("/profile", ctrl.getProfile);
router.put("/profile", ctrl.updateProfile);
router.put("/change-password", ctrl.changePassword);

// Admin user management endpoints
router.get("/", requireAdmin, ctrl.listUsers);
router.put("/:id", requireAdmin, ctrl.updateUser);
router.delete("/:id", requireAdmin, ctrl.deleteUser);
router.post("/:id/restore", requireAdmin, ctrl.restoreUser);

module.exports = router;
