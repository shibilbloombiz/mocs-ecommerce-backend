// Pure Multer disk storage for local media uploads (products, banners, hero, reviews, categories, avatars)
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure the root uploads directory exists
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Pre-create common upload categories
const commonSubfolders = [
  "products",
  "banners",
  "categories",
  "collections",
  "auth",
  "ads",
  "collage",
  "avatars",
  "reviews",
  "general",
];
for (const folder of commonSubfolders) {
  const folderPath = path.join(uploadsDir, folder);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
}

console.log("Using categorized Multer disk storage for uploads at:", uploadsDir);

const sanitizeName = (str) => {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/\.[^/.]+$/, "") // strip extension
    .replace(/[^a-z0-9_-]+/g, "-") // replace non-alphanumerics with hyphens
    .replace(/-+/g, "-") // collapse repeated hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
};

/**
 * Resolves the designated upload subfolder based on request metadata.
 */
const resolveUploadSubfolder = (req, file) => {
  if (req.uploadFolder) {
    return sanitizeName(req.uploadFolder) || "general";
  }

  const rawType = (
    req.query?.type ||
    req.body?.type ||
    req.headers?.["x-upload-type"] ||
    (file?.fieldname && !["image", "images", "file", "files"].includes(file.fieldname) ? file.fieldname : "") ||
    ""
  ).toLowerCase().trim();

  // 1. Products & Hero Shoe Cutouts
  if (
    rawType === "hero-product" ||
    rawType === "hero-shoe" ||
    rawType === "shoe" ||
    rawType === "product" ||
    rawType === "products" ||
    rawType === "item" ||
    rawType === "variant"
  ) {
    return "products";
  }

  // 2. Banners / Hero Slideshow
  if (
    rawType.includes("hero-banner") ||
    rawType.includes("hero-mobile-banner") ||
    rawType.includes("hero-slide") ||
    rawType === "hero" ||
    rawType === "banner" ||
    rawType === "banners" ||
    rawType === "slider" ||
    rawType === "slideshow"
  ) {
    return "banners";
  }

  // 3. Category Banners & Lifestyle Gallery
  if (
    rawType.includes("category") ||
    rawType.includes("gallery") ||
    rawType === "cat"
  ) {
    return "categories";
  }

  // 4. Collection Banners & Thumbnails
  if (rawType.includes("collection")) {
    return "collections";
  }

  // 5. Auth / Login / Signup Slides
  if (
    rawType.includes("auth") ||
    rawType.includes("login") ||
    rawType.includes("signup")
  ) {
    return "auth";
  }

  // 6. Advertisements & Promo Cards
  if (
    rawType.includes("ad") ||
    rawType.includes("promo") ||
    rawType.includes("advertisement")
  ) {
    return "ads";
  }

  // 7. Promise & Collage Sections
  if (rawType.includes("collage") || rawType.includes("promise")) {
    return "collage";
  }

  // 8. User Avatars & Profiles
  if (
    rawType.includes("avatar") ||
    rawType.includes("user") ||
    rawType.includes("profile")
  ) {
    return "avatars";
  }

  // 9. Customer Reviews & Testimonials
  if (rawType.includes("review") || rawType.includes("feedback")) {
    return "reviews";
  }

  // Fallback for product routes
  if (req.baseUrl?.includes("/products") || req.path?.includes("/products")) {
    return "products";
  }

  return "general";
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subfolder = resolveUploadSubfolder(req, file);
    file.subfolder = subfolder;
    file.uploadSubfolder = subfolder;

    const targetDir = path.join(uploadsDir, subfolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    // 1. Detect category / type from query, body, or fieldname
    const rawType =
      req.query?.type ||
      req.body?.type ||
      req.headers?.["x-upload-type"] ||
      (file.fieldname && !["image", "images", "file", "files"].includes(file.fieldname) ? file.fieldname : "") ||
      file.subfolder ||
      "";

    const typePrefix = sanitizeName(rawType);

    // 2. Extract and sanitize original file base name
    const rawBaseName = path.parse(file.originalname).name || "image";
    let baseName = sanitizeName(rawBaseName);

    // Generic placeholder names to replace with descriptive names
    const genericNames = ["image", "img", "upload", "file", "blob", "untitled", "picture", "photo", "download"];
    if (genericNames.includes(baseName) || !baseName) {
      baseName = typePrefix || "media";
    }

    // 3. Build descriptive prefix
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
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".svg", ".gif"];
    const ext = path.extname(file.originalname).toLowerCase();

    const isImageMime = file.mimetype && file.mimetype.startsWith("image/");
    const isImageExt = allowedExtensions.includes(ext);

    if (!isImageMime && !isImageExt) {
      return cb(new Error("Only image files (JPG, JPEG, PNG, WebP, AVIF, SVG, GIF) are allowed for upload"));
    }
    cb(null, true);
  },
});


module.exports = {
  upload,
  uploadsDir,
  resolveUploadSubfolder,
  sanitizeName,
};

