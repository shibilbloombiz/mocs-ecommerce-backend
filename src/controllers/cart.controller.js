const asyncHandler = require("express-async-handler");
const Cart = require("../models/Cart");

exports.get = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).populate("items.product");
  res.json(cart || { user: req.user._id, items: [] });
});

exports.add = asyncHandler(async (req, res) => {
  const { productId, size, color } = req.body;
  const qty = Number(req.body.qty || req.body.quantity || 1);
  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });

  const existing = cart.items.find(
    (i) => i.product.toString() === productId && i.size === size && i.color === color,
  );
  if (existing) existing.qty += qty;
  else cart.items.push({ product: productId, size, color, qty });

  await cart.save();
  res.status(201).json(await cart.populate("items.product"));
});

exports.updateItem = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  const item = cart?.items.id(req.params.id);
  if (!item) { res.status(404); throw new Error("Item not found"); }
  item.qty = Math.max(1, Number(req.body.qty));
  await cart.save();
  res.json(await cart.populate("items.product"));
});

exports.removeItem = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  const item = cart?.items.id(req.params.id);
  if (!item) { res.status(404); throw new Error("Item not found"); }
  item.deleteOne();
  await cart.save();
  res.json(await cart.populate("items.product"));
});
