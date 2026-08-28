// Multer storage for product/review/category/user uploads.
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure the local uploads directory exists
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

console.log("Using local Multer disk storage for uploads at:", uploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate clean, collision-free filename: timestamp-random.ext
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const cleanExt = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `img-${uniqueSuffix}${cleanExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB file limit
  fileFilter: (_req, file, cb) => {
    // Validate image mime types
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files (JPG, PNG, WebP, AVIF, SVG) are allowed"));
    }
    cb(null, true);
  },
});

// Fallback dummy Cloudinary object to prevent breakage in existing references
const cloudinary = {
  uploader: {
    upload: async () => ({ url: "", public_id: "" }),
    destroy: async () => ({ result: "ok" }),
  },
};

module.exports = { upload, cloudinary };
