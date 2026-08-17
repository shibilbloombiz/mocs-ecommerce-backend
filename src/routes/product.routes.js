const router = require("express").Router();
const ctrl = require("../controllers/product.controller");
const { protect, requireAdmin } = require("../middleware/auth");
const { upload } = require("../config/cloudinary");

router.get("/", ctrl.list);
router.get("/related/:id", ctrl.related);

// IMPORTANT: image route must be before "/:id"
router.get("/image/:imageId", ctrl.getProductImage);

router.get("/:id", ctrl.get);

router.use(protect, requireAdmin);

router.post("/sync-review-counts", ctrl.syncReviewCounts);
router.post("/upload", upload.single("image"), ctrl.uploadSingleImage);

router.post("/", ctrl.create);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);
router.post("/:id/restore", ctrl.restore);

router.post(
  "/:id/images",
  upload.array("images", 8),
  ctrl.uploadImages
);

module.exports = router;
