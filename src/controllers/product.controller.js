const asyncHandler = require("express-async-handler");
const Product = require("../models/Product");
const ProductImage = require("../models/ProductImage");
const path = require("path");

const deleteMongoImage = async (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== "string") return;
  const match = imageUrl.match(/\/api\/products\/image\/([a-fA-F0-9]{24})/);
  if (match) {
    const imageId = match[1];
    try {
      await ProductImage.findByIdAndDelete(imageId);
      console.log(`Successfully cleaned up image ${imageId} from MongoDB`);
    } catch (err) {
      console.error(`Failed to clean up image ${imageId} from MongoDB:`, err);
    }
  }
};


exports.getProductImage = asyncHandler(async (req, res) => {
  const image = await ProductImage.findById(req.params.imageId);

  if (!image) {
    res.status(404);
    throw new Error("Image not found");
  }

  res.set("Content-Type", image.contentType);
  res.set("Cache-Control", "public, max-age=31536000");

  res.send(image.data);
});


// GET /api/products?search=&category=&color=&size=&minPrice=&maxPrice=&sort=&page=&limit=&showDeleted=&showInactive=
exports.list = asyncHandler(async (req, res) => {
  const {
    search, category, color, size, minPrice, maxPrice, artNumber, collection,
    sort = "-createdAt", page = 1, limit = 24,
    showDeleted = "false", showInactive = "false",
  } = req.query;

  const q = {};

  if (artNumber) q.artNumber = artNumber;
  if (collection) q.collection = collection;

  // Handle soft delete filter
  if (showDeleted === "true") {
    q.isDeleted = true;
  } else if (showDeleted === "all") {
    // do not filter by isDeleted
  } else {
    q.isDeleted = { $ne: true };
  }

  // Handle active/inactive status filter
  if (showInactive === "true") {
    q.isPublished = false;
  } else if (showInactive === "all") {
    // do not filter by isPublished
  } else {
    q.isPublished = true;
  }

  if (search) {
    q.$or = [
      { name: { $regex: search, $options: "i" } },
      { artNumber: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { collection: { $regex: search, $options: "i" } }
    ];
  }
  if (category) q.category = category;
  if (color) q["colors.name"] = color;
  if (size) q.sizes = Number(size);
  if (minPrice || maxPrice) {
    q.price = {};
    if (minPrice) q.price.$gte = Number(minPrice);
    if (maxPrice) q.price.$lte = Number(maxPrice);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Product.find(q).sort(sort).skip(skip).limit(Number(limit)).populate("category"),
    Product.countDocuments(q),
  ]);
  res.json({ items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

exports.get = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate("category");
  if (!product || (product.isDeleted && req.query.adminMode !== "true")) {
    res.status(404);
    throw new Error("Product not found");
  }
  res.json(product);
});

exports.related = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) { res.status(404); throw new Error("Product not found"); }
  const items = await Product.find({
    _id: { $ne: product._id },
    category: product.category,
    isPublished: true,
    isDeleted: { $ne: true },
  }).limit(8);
  res.json(items);
});

exports.create = asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json(product);
});

exports.update = asyncHandler(async (req, res) => {
  const existingProduct = await Product.findById(req.params.id);
  if (!existingProduct) {
    res.status(404);
    throw new Error("Product not found");
  }

  // If coverImage is changed, clean up the old one
  if (req.body.coverImage && req.body.coverImage !== existingProduct.coverImage) {
    await deleteMongoImage(existingProduct.coverImage);
  }

  // If additionalImages are updated, clean up any old images that were removed
  if (req.body.additionalImages) {
    const oldImgs = existingProduct.additionalImages || [];
    const newImgs = req.body.additionalImages || [];
    
    for (const oldImg of oldImgs) {
      const isStillPresent = newImgs.some(newImg => newImg.url === oldImg.url);
      if (!isStillPresent) {
        await deleteMongoImage(oldImg.url);
      }
    }
  }

  // If colors (variants) are updated, clean up any old variant images that were removed
  if (req.body.colors) {
    const oldVariants = existingProduct.colors || [];
    const newVariants = req.body.colors || [];
    
    // Build set of all new variant image URLs
    const newUrls = new Set();
    newVariants.forEach(v => {
      if (v.images) {
        v.images.forEach(img => {
          if (img.url) newUrls.add(img.url);
        });
      }
    });

    // Clean up old images that are no longer in newUrls
    for (const oldV of oldVariants) {
      if (oldV.images) {
        for (const img of oldV.images) {
          if (img.url && !newUrls.has(img.url)) {
            await deleteMongoImage(img.url);
          }
        }
      }
    }
  }

  const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true, runValidators: true,
  });
  
  res.json(product);
});

exports.remove = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) { res.status(404); throw new Error("Product not found"); }
  
  product.isDeleted = true;
  product.deletedAt = new Date();
  await product.save();
  
  res.json({ ok: true, message: "Product soft-deleted successfully" });
});

exports.restore = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) { res.status(404); throw new Error("Product not found"); }
  
  product.isDeleted = false;
  product.deletedAt = undefined;
  await product.save();
  
  res.json({ ok: true, message: "Product restored successfully", product });
});

// POST /api/products/:id/images   (admin, multipart) — uploads to S3/Cloudinary/Local disk.
exports.uploadImages = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  const variant = product.colors.find((c) => c.name === req.body.color);

  if (!variant) {
    res.status(400);
    throw new Error("Color variant not found");
  }

  for (const file of req.files || []) {
    let url;
    if (file.location) {
      url = file.location;
    } else if (file.path) {
      if (file.path.startsWith("http")) {
        url = file.path;
      } else {
        url = `/uploads/${path.basename(file.path)}`;
      }
    } else if (file.filename) {
      url = `/uploads/${file.filename}`;
    } else {
      url = `/uploads/${file.originalname}`;
    }

    variant.images.push({
      label: req.body.label || "Front",
      url,
      publicId: file.filename || file.originalname,
    });
  }

  await product.save();

  res.status(201).json(product);
});

// POST /api/products/upload   (admin, multipart) — uploads a single image.
exports.uploadSingleImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("No file uploaded");
  }

  let url;
  if (req.file.location) {
    url = req.file.location;
  } else if (req.file.path) {
    if (req.file.path.startsWith("http")) {
      url = req.file.path;
    } else {
      url = `/uploads/${path.basename(req.file.path)}`;
    }
  } else if (req.file.filename) {
    url = `/uploads/${req.file.filename}`;
  } else {
    url = `/uploads/${req.file.originalname}`;
  }

  res.status(201).json({
    url,
    filename: req.file.originalname,
  });
});
