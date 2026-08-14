const router = require("express").Router();
const ctrl = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth");
const validate = require("../middleware/validate");
const {
  registerSchema, loginSchema, forgotSchema, resetSchema,
} = require("../validators/auth.schema");

router.post("/register", validate(registerSchema), ctrl.register);
router.post("/login", validate(loginSchema), ctrl.login);
router.post("/clerk-sync", ctrl.clerkSync);
router.post("/google", ctrl.googleAuth);
router.get("/me", protect, ctrl.me);
router.post("/forgot", validate(forgotSchema), ctrl.forgotPassword);
router.post("/reset", validate(resetSchema), ctrl.resetPassword);
router.post("/logout", ctrl.logout);

module.exports = router;
