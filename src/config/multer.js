// Pure Multer disk storage for local media uploads (products, banners, hero, reviews, categories, avatars)
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure the local uploads directory exists
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

console.log("Using local Multer disk storage for uploads at:", uploadsDir);

const sanitizeName = (str) => {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/\.[^/.]+$/, "") // strip extension
    .replace(/[^a-z0-9_-]+/g, "-") // replace non-alphanumerics with hyphens
    .replace(/-+/g, "-") // collapse repeated hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // 1. Detect category / type from query, body, or fieldname
    const rawType =
      req.query?.type ||
      req.body?.type ||
      (file.fieldname && !["image", "images", "file", "files"].includes(file.fieldname) ? file.fieldname : "") ||
      "";

    const typePrefix = sanitizeName(rawType);

    // 2. Extract and sanitize original file base name
    const rawBaseName = path.parse(file.originalname).name || "image";
    let baseName = sanitizeName(rawBaseName);

    // Generic placeholder names to replace with descriptive names
    const genericNames = ["image", "img", "upload", "file", "blob", "untitled", "picture", "photo", "download"];
    if (genericNames.includes(baseName) || !baseName) {
      baseName = typePrefix || "image";
    }

    // 3. Build descriptive prefix (e.g. banner-summer-sale or hero-slide)
    let finalPrefix = baseName;
    if (typePrefix && !baseName.startsWith(typePrefix)) {
      finalPrefix = `${typePrefix}-${baseName}`;
    }

    // Truncate to reasonable length
    finalPrefix = finalPrefix.slice(0, 45).replace(/-+$/, "");

    // 4. Generate unique timestamp + random suffix to prevent collisions
    const timestamp = Date.now();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";

    const generatedFilename = `${finalPrefix}-${timestamp}-${randomSuffix}${ext}`;
    cb(null, generatedFilename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB file limit
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files (JPG, PNG, WebP, AVIF, SVG, GIF) are allowed"));
    }
    cb(null, true);
  },
});

module.exports = { upload };
