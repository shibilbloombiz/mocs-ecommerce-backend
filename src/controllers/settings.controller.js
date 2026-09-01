const asyncHandler = require("express-async-handler");
const Settings = require("../models/Settings");
const path = require("path");
const fs = require("fs");

function extractImageUrls(obj) {
  const urls = [];
  const findUrls = (val) => {
    if (typeof val === "string") {
      if (val.includes("/uploads/")) {
        urls.push(val);
      }
    } else if (Array.isArray(val)) {
      for (const item of val) {
        findUrls(item);
      }
    } else if (val && typeof val === "object") {
      for (const key of Object.keys(val)) {
        findUrls(val[key]);
      }
    }
  };
  findUrls(obj);
  return urls;
}

const deleteImageUrl = async (url) => {
  if (!url || typeof url !== "string") return;

  // Local disk cleanup
  if (url.includes("/uploads/")) {
    try {
      const match = url.match(/\/uploads\/(.+)$/);
      if (match) {
        const relPath = match[1].split("?")[0].replace(/^\/+/, "");
        const safeRelPath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, "");
        const filePath = path.join(__dirname, "..", "uploads", safeRelPath);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Successfully deleted local settings image: ${safeRelPath}`);
        } else {
          // Backward-compatibility: Check in root uploads folder
          const rootFilename = path.basename(safeRelPath);
          const rootFilePath = path.join(__dirname, "..", "uploads", rootFilename);
          if (fs.existsSync(rootFilePath)) {
            fs.unlinkSync(rootFilePath);
            console.log(`Successfully deleted local settings image from root: ${rootFilename}`);
          }
        }
      }
    } catch (err) {
      console.error("Failed to delete local settings image:", err);
    }
    return;
  }
};


// GET /api/settings/:key
exports.getSettings = asyncHandler(async (req, res) => {
  const setting = await Settings.findOne({ key: req.params.key });
  if (!setting) {
    return res.json({ key: req.params.key, value: null });
  }
  res.json(setting);
});

// PUT /api/settings/:key
exports.updateSettings = asyncHandler(async (req, res) => {
  const { value } = req.body;
  let setting = await Settings.findOne({ key: req.params.key });
  if (setting) {
    // Find deleted images to clean up
    try {
      const oldUrls = extractImageUrls(setting.value);
      const newUrls = new Set(extractImageUrls(value));
      const deletedUrls = oldUrls.filter(url => !newUrls.has(url));
      
      for (const url of deletedUrls) {
        await deleteImageUrl(url);
      }
    } catch (cleanupErr) {
      console.error("Error cleaning up settings images:", cleanupErr);
    }

    setting.value = value;
    await setting.save();
  } else {
    setting = await Settings.create({ key: req.params.key, value });
  }
  res.json(setting);
});
