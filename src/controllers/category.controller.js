const asyncHandler = require("express-async-handler");
const Category = require("../models/Category");

// GET /api/categories
exports.list = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort("name");
  res.json(categories);
});

// POST /api/categories (Admin only)
exports.create = asyncHandler(async (req, res) => {
  const { name, description, image } = req.body;
  if (!name) {
    res.status(400);
    throw new Error("Category name is required");
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");

  const existing = await Category.findOne({ slug });
  if (existing) {
    res.status(400);
    throw new Error("Category name already exists");
  }

  const category = await Category.create({ name, slug, description, image });
  res.status(201).json(category);
});
