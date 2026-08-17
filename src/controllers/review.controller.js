const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Review = require("../models/Review");
const Product = require("../models/Product");

const recalcRating = async (productId) => {
  try {
    if (!productId) return;
    let targetProduct = null;
    if (mongoose.Types.ObjectId.isValid(productId)) {
      targetProduct = await Product.findById(productId);
    }
    if (!targetProduct) {
      targetProduct = await Product.findOne({
        $or: [{ slug: productId }, { name: new RegExp(`^${productId}$`, "i") }],
      });
    }

    if (!targetProduct) return;
    const targetId = targetProduct._id;

    // Match reviews by ObjectId OR by slug string
    const reviews = await Review.find({
      $or: [{ product: targetId }, { product: targetProduct.slug }],
    });

    const count = reviews.length;
    const avg =
      count > 0
        ? Math.round((reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / count) * 10) / 10
        : 5;

    await Product.findByIdAndUpdate(targetId, {
      rating: count > 0 ? avg : 5,
      reviewCount: count,
    });
  } catch (err) {
    console.error("Recalculate rating error:", err);
  }
};

// GET /api/reviews/:productId?color=
exports.list = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  if (!productId) return res.json([]);

  let targetProduct = null;
  if (mongoose.Types.ObjectId.isValid(productId)) {
    targetProduct = await Product.findById(productId);
  }
  if (!targetProduct) {
    targetProduct = await Product.findOne({
      $or: [
        { slug: productId },
        { artNumber: productId },
        { name: new RegExp(`^${productId}$`, "i") }
      ],
    });
  }

  const queryConditions = [];
  if (targetProduct) {
    queryConditions.push({ product: targetProduct._id });
  } else if (mongoose.Types.ObjectId.isValid(productId)) {
    queryConditions.push({ product: productId });
  }

  // If no matching product exists in MongoDB and productId is not an ObjectId, return empty array
  if (queryConditions.length === 0) {
    return res.json([]);
  }

  const q = queryConditions.length === 1 ? queryConditions[0] : { $or: queryConditions };
  if (req.query.color) q.color = req.query.color;
  const items = await Review.find(q).sort("-createdAt").populate("user", "name avatar");
  res.json(items);
});

exports.create = asyncHandler(async (req, res) => {
  const { product, productId, rating, text, comment, color, size, images } = req.body;
  const rawId = product || productId;

  if (!rawId) {
    res.status(400);
    throw new Error("Please select a valid product to review.");
  }

  let targetProduct = null;
  if (mongoose.Types.ObjectId.isValid(rawId)) {
    targetProduct = await Product.findById(rawId);
  }
  if (!targetProduct) {
    targetProduct = await Product.findOne({
      $or: [{ slug: rawId }, { name: new RegExp(`^${rawId}$`, "i") }],
    });
  }

  if (!targetProduct) {
    res.status(404);
    throw new Error("Product not found");
  }

  const targetProductId = targetProduct._id;

  const reviewRating = Number(rating);
  if (!reviewRating || reviewRating < 1 || reviewRating > 5) {
    res.status(400);
    throw new Error("Please select a rating between 1 and 5 stars.");
  }

  const reviewText = (text || comment || "").trim();
  if (!reviewText) {
    res.status(400);
    throw new Error("Please write a short review before submitting.");
  }

  // Check if review already exists for this user and product
  let review = await Review.findOne({
    $or: [
      { product: targetProductId, user: req.user._id },
      { product: targetProduct.slug, user: req.user._id },
    ],
  });

  if (review) {
    review.product = targetProductId;
    review.rating = reviewRating;
    review.text = reviewText;
    if (color) review.color = color;
    if (size) review.size = size;
    if (images) review.images = images;
    review.verifiedPurchase = true;
    await review.save();
  } else {
    review = await Review.create({
      product: targetProductId,
      rating: reviewRating,
      text: reviewText,
      color: color || "Default",
      size: size || null,
      images: images || [],
      user: req.user._id,
      verifiedPurchase: true,
    });
  }

  await recalcRating(targetProductId);

  const populated = await Review.findById(review._id).populate("user", "name avatar");
  res.status(201).json(populated);
});

exports.update = asyncHandler(async (req, res) => {
  const review = await Review.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    req.body,
    { new: true, runValidators: true },
  );
  if (!review) { res.status(404); throw new Error("Review not found"); }
  await recalcRating(review.product);
  const populated = await Review.findById(review._id).populate("user", "name avatar");
  res.json(populated);
});

exports.remove = asyncHandler(async (req, res) => {
  const review = await Review.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!review) { res.status(404); throw new Error("Review not found"); }
  await recalcRating(review.product);
  res.json({ ok: true });
});

exports.helpful = asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { $inc: { helpfulCount: 1 } },
    { new: true },
  );
  res.json(review);
});
