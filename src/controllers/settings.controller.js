const asyncHandler = require("express-async-handler");
const Settings = require("../models/Settings");
const { cloudinary } = require("../config/cloudinary");

function getPublicIdFromUrl(url) {
  if (typeof url !== "string" || !url.includes("cloudinary.com") || !url.includes("/upload/")) return null;
  try {
    const parts = url.split("/upload/");
    if (parts.length < 2) return null;
    let pathPart = parts[1];
    // Remove version segment (e.g. v12345678/)
    pathPart = pathPart.replace(/^v\d+\//, "");
    // Remove file extension
    pathPart = pathPart.replace(/\.[^/.]+$/, "");
    return pathPart;
  } catch (err) {
    console.error("Error extracting public ID:", err);
    return null;
  }
}

function extractCloudinaryUrls(obj) {
  const urls = [];
  const findUrls = (val) => {
    if (typeof val === "string") {
      if (val.includes("cloudinary.com") && val.includes("/upload/")) {
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

const deleteCloudinaryUrl = async (url) => {
  const publicId = getPublicIdFromUrl(url);
  if (publicId) {
    try {
      console.log(`Deleting old Cloudinary image: ${publicId}`);
      await cloudinary.uploader.destroy(publicId);
      console.log(`Successfully deleted Cloudinary image: ${publicId}`);
    } catch (err) {
      console.error(`Failed to delete Cloudinary image: ${publicId}`, err);
    }
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
      const oldUrls = extractCloudinaryUrls(setting.value);
      const newUrls = new Set(extractCloudinaryUrls(value));
      const deletedUrls = oldUrls.filter(url => !newUrls.has(url));
      
      for (const url of deletedUrls) {
        await deleteCloudinaryUrl(url);
      }
    } catch (cleanupErr) {
      console.error("Error cleaning up settings Cloudinary images:", cleanupErr);
    }

    setting.value = value;
    await setting.save();
  } else {
    setting = await Settings.create({ key: req.params.key, value });
  }
  res.json(setting);
});
