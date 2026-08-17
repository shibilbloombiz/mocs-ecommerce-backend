const asyncHandler = require("express-async-handler");
const Product = require("../models/Product");
const Review = require("../models/Review");
const ProductImage = require("../models/ProductImage");
const path = require("path");
const { cloudinary } = require("../config/cloudinary");

const getPublicIdFromUrl = (url) => {
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
};

const deleteProductImage = async (url, publicId) => {
  if (!url || typeof url !== "string") return;

  // 1. Clean up from MongoDB if binary
  const match = url.match(/\/api\/products\/image\/([a-fA-F0-9]{24})/);
  if (match) {
    const imageId = match[1];
    try {
      await ProductImage.findByIdAndDelete(imageId);
      console.log(`Successfully cleaned up image ${imageId} from MongoDB`);
    } catch (err) {
      console.error(`Failed to clean up image ${imageId} from MongoDB:`, err);
    }
    return;
  }

  // 2. Clean up from Cloudinary
  let actualPublicId = publicId;
  if (!actualPublicId && url.includes("cloudinary.com")) {
    actualPublicId = getPublicIdFromUrl(url);
  }

  if (actualPublicId && url.includes("cloudinary.com")) {
    try {
      console.log(`Deleting Cloudinary asset: ${actualPublicId}`);
      await cloudinary.uploader.destroy(actualPublicId);
      console.log(`Successfully deleted Cloudinary asset: ${actualPublicId}`);
    } catch (err) {
      console.error(`Failed to delete Cloudinary asset ${actualPublicId}:`, err);
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

  // Use $lookup to get live review count + avg rating in one aggregation query.
  // Uses a pipeline-based $lookup so reviews stored with either ObjectId or slug string are counted.
  const pipeline = [
    { $match: q },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: Number(limit) },
    {
      $lookup: {
        from: "reviews",
        let: { productId: "$_id", productSlug: "$slug" },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ["$product", "$$productId"] },
                  { $eq: ["$product", "$$productSlug"] },
                ],
              },
            },
          },
        ],
        as: "_reviews",
      },
    },
    {
      $addFields: {
        reviewCount: { $size: "$_reviews" },
        rating: {
          $cond: {
            if: { $gt: [{ $size: "$_reviews" }, 0] },
            then: {
              $round: [
                { $divide: [{ $sum: "$_reviews.rating" }, { $size: "$_reviews" }] },
                1,
              ],
            },
            else: { $ifNull: ["$rating", 5] },
          },
        },
      },
    },
    { $project: { _reviews: 0 } },
  ];

  // Apply sort separately since pipeline sort must come first
  if (sort) {
    const sortField = sort.startsWith("-") ? sort.slice(1) : sort;
    const sortDir = sort.startsWith("-") ? -1 : 1;
    pipeline.splice(1, 1, { $sort: { [sortField]: sortDir } });
  }

  const [enhancedItems, total] = await Promise.all([
    Product.aggregate(pipeline).collation({ locale: "en" }),
    Product.countDocuments(q),
  ]);

  // Populate category for each item (aggregation doesn't auto-populate)
  const Category = require("../models/Category");
  const categoryIds = [...new Set(enhancedItems.map((p) => p.category?.toString()).filter(Boolean))];
  const categories = await Category.find({ _id: { $in: categoryIds } }).lean();
  const catMap = new Map(categories.map((c) => [c._id.toString(), c]));
  const finalItems = enhancedItems.map((p) => ({
    ...p,
    category: catMap.get(p.category?.toString()) || p.category,
  }));

  res.json({ items: finalItems, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

exports.get = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate("category");
  if (!product || (product.isDeleted && req.query.adminMode !== "true")) {
    res.status(404);
    throw new Error("Product not found");
  }
  // Count reviews by both ObjectId and slug to handle legacy slug-stored references
  const reviews = await Review.find({
    $or: [{ product: product._id }, { product: product.slug }],
  });
  const obj = product.toObject();
  obj.reviewCount = reviews.length;
  obj.rating =
    reviews.length > 0
      ? Math.round((reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / reviews.length) * 10) / 10
      : (product.rating || 5);
  res.json(obj);
});

// POST /api/products/sync-review-counts — repair stale reviewCount on all products
exports.syncReviewCounts = asyncHandler(async (req, res) => {
  const products = await Product.find({});
  const updates = await Promise.all(
    products.map(async (product) => {
      // Count reviews by both ObjectId and slug to handle legacy slug-stored references
      const reviews = await Review.find({
        $or: [{ product: product._id }, { product: product.slug }],
      });
      const count = reviews.length;
      const avg =
        count > 0
          ? Math.round((reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / count) * 10) / 10
          : 5;
      await Product.findByIdAndUpdate(product._id, { reviewCount: count, rating: count > 0 ? avg : 5 });
      return { id: product._id, reviewCount: count, rating: count > 0 ? avg : 5 };
    })
  );
  res.json({ synced: updates.length, updates });
});

exports.related = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) { res.status(404); throw new Error("Product not found"); }
  const [items, allReviews] = await Promise.all([
    Product.find({
      _id: { $ne: product._id },
      category: product.category,
      isPublished: true,
      isDeleted: { $ne: true },
    }).limit(8),
    Review.find({}).select("product rating"),
  ]);

  const statsMap = new Map();
  if (Array.isArray(allReviews)) {
    allReviews.forEach((r) => {
      if (!r.product) return;
      const key = r.product.toString();
      const cur = statsMap.get(key) || { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += Number(r.rating) || 5;
      statsMap.set(key, cur);
    });
  }

  const enhancedItems = items.map((prod) => {
    const obj = prod.toObject ? prod.toObject() : { ...prod };
    const idKey = obj._id ? obj._id.toString() : "";
    const slugKey = obj.slug;
    const nameKey = obj.name;

    const statId = idKey ? statsMap.get(idKey) : null;
    const statSlug = slugKey ? statsMap.get(slugKey) : null;
    const statName = nameKey ? statsMap.get(nameKey) : null;

    const totalCount = (statId?.count || 0) + (statSlug?.count || 0) + (statName?.count || 0);
    const totalSum = (statId?.sum || 0) + (statSlug?.sum || 0) + (statName?.sum || 0);

    if (totalCount > 0) {
      obj.reviewCount = totalCount;
      obj.rating = Math.round((totalSum / totalCount) * 10) / 10;
    } else {
      obj.reviewCount = obj.reviewCount || 0;
      obj.rating = obj.rating || 5;
    }
    return obj;
  });

  res.json(enhancedItems);
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
    await deleteProductImage(existingProduct.coverImage);
  }

  // If additionalImages are updated, clean up any old images that were removed
  if (req.body.additionalImages) {
    const oldImgs = existingProduct.additionalImages || [];
    const newImgs = req.body.additionalImages || [];
    
    for (const oldImg of oldImgs) {
      const isStillPresent = newImgs.some(newImg => newImg.url === oldImg.url);
      if (!isStillPresent) {
        await deleteProductImage(oldImg.url, oldImg.publicId);
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
            await deleteProductImage(img.url, img.publicId);
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
    public_id: req.file.filename || req.file.public_id || "",
    filename: req.file.originalname,
  });
});
