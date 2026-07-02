const asyncHandler = require("express-async-handler");
const Review = require("../models/Review");
const Product = require("../models/Product");

const recalcRating = async (productId) => {
  const stats = await Review.aggregate([
    { $match: { product: productId } },
    { $group: { _id: "$product", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = stats[0] || {};
  await Product.findByIdAndUpdate(productId, { rating: avg, reviewCount: count });
};

// GET /api/reviews/:productId?color=
exports.list = asyncHandler(async (req, res) => {
  const q = { product: req.params.productId };
  if (req.query.color) q.color = req.query.color;
  const items = await Review.find(q).sort("-createdAt").populate("user", "name avatar");
  res.json(items);
});

exports.create = asyncHandler(async (req, res) => {
  const { product, rating, text, color, images } = req.body;
  const review = await Review.create({
    product, rating, text, color, images,
    user: req.user._id,
    verifiedPurchase: true, // TODO: check order history
  });
  await recalcRating(product);
  res.status(201).json(review);
});

exports.update = asyncHandler(async (req, res) => {
  const review = await Review.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    req.body,
    { new: true, runValidators: true },
  );
  if (!review) { res.status(404); throw new Error("Review not found"); }
  await recalcRating(review.product);
  res.json(review);
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
