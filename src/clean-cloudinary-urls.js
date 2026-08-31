const path = require("path");
require("dotenv").config();
if (!process.env.MONGO_URI) {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
}
const mongoose = require("mongoose");
const Product = require("./models/Product");
const Settings = require("./models/Settings");
const Collection = require("./models/Collection");
const Category = require("./models/Category");

const cleanCloudinaryUrls = async () => {
  const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/mocs";

  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.");

    let productsUpdated = 0;
    let settingsUpdated = 0;

    // 1. Scan and clean Products
    const products = await Product.find({
      $or: [
        { coverImage: { $regex: "cloudinary.com", $options: "i" } },
        { "colors.images.url": { $regex: "cloudinary.com", $options: "i" } },
        { "additionalImages.url": { $regex: "cloudinary.com", $options: "i" } },
      ],
    });

    console.log(`Found ${products.length} products with legacy Cloudinary image URLs.`);

    for (const p of products) {
      let modified = false;

      // Clean coverImage
      if (p.coverImage && p.coverImage.includes("cloudinary.com")) {
        console.log(`  Replacing Cloudinary coverImage for product: "${p.name}" (${p.slug})`);
        p.coverImage = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=1000";
        modified = true;
      }

      // Clean colors gallery images
      if (Array.isArray(p.colors)) {
        p.colors.forEach((c) => {
          if (Array.isArray(c.images)) {
            c.images = c.images.filter((img) => !img.url || !img.url.includes("cloudinary.com"));
            modified = true;
          }
        });
      }

      // Clean additionalImages
      if (Array.isArray(p.additionalImages)) {
        p.additionalImages = p.additionalImages.filter(
          (img) => !img.url || !img.url.includes("cloudinary.com")
        );
        modified = true;
      }

      if (modified) {
        await p.save();
        productsUpdated++;
      }
    }

    // 2. Scan and clean Settings (hero slides, banners, advertisements)
    const settings = await Settings.find({});
    console.log(`Scanning settings collections...`);

    for (const s of settings) {
      const rawStr = JSON.stringify(s.value || {});
      if (rawStr.includes("cloudinary.com")) {
        console.log(`  Found Cloudinary URLs in setting key: "${s.key}"`);

        // If hero_slides setting contains old Cloudinary links, sanitize them
        if (s.key === "hero_slides" && Array.isArray(s.value)) {
          s.value = s.value.map((slide) => ({
            ...slide,
            bg: slide.bg && slide.bg.includes("cloudinary.com") ? "/hero-comfort-banner.jpg" : slide.bg,
            mobileBg: slide.mobileBg && slide.mobileBg.includes("cloudinary.com") ? "/hero-comfort-banner.jpg" : slide.mobileBg,
          }));
        } else {
          // Replace any remaining cloudinary strings in setting with empty string or fallback
          const cleanedStr = rawStr.replace(/https?:\/\/res\.cloudinary\.com\/[^\s"']+/g, "");
          try {
            s.value = JSON.parse(cleanedStr);
          } catch (e) {}
        }

        s.markModified("value");
        await s.save();
        settingsUpdated++;
      }
    }

    console.log(`\n======================================================`);
    console.log(`✅ Cleanup Complete!`);
    console.log(`   Products sanitized: ${productsUpdated}`);
    console.log(`   Settings records sanitized: ${settingsUpdated}`);
    console.log(`======================================================\n`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
    process.exit(1);
  }
};

cleanCloudinaryUrls();
