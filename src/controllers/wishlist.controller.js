const asyncHandler = require("express-async-handler");
const Wishlist = require("../models/Wishlist");

exports.get = asyncHandler(async (req, res) => {
  const wl = await Wishlist.findOne({ user: req.user._id }).populate("products");
  res.json(wl || { user: req.user._id, products: [] });
});

exports.add = asyncHandler(async (req, res) => {
  const wl = await Wishlist.findOneAndUpdate(
    { user: req.user._id },
    { $addToSet: { products: req.body.productId } },
    { upsert: true, new: true },
  ).populate("products");
  res.status(201).json(wl);
});

exports.remove = asyncHandler(async (req, res) => {
  const wl = await Wishlist.findOneAndUpdate(
    { user: req.user._id },
    { $pull: { products: req.params.id } },
    { new: true },
  ).populate("products");
  res.json(wl);
});
