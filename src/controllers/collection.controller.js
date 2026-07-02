const asyncHandler = require("express-async-handler");
const Collection = require("../models/Collection");

// GET /api/collections
exports.list = asyncHandler(async (req, res) => {
  const collections = await Collection.find().sort("name");
  res.json(collections);
});

// POST /api/collections (Admin only)
exports.create = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    res.status(400);
    throw new Error("Collection name is required");
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");

  const existing = await Collection.findOne({ slug });
  if (existing) {
    res.status(400);
    throw new Error("Collection name already exists");
  }

  const collection = await Collection.create({ name, slug, description });
  res.status(201).json(collection);
});

// DELETE /api/collections/:id (Admin only)
exports.remove = asyncHandler(async (req, res) => {
  const collection = await Collection.findById(req.params.id);
  if (!collection) {
    res.status(404);
    throw new Error("Collection not found");
  }

  await collection.deleteOne();
  res.json({ ok: true, message: "Collection deleted successfully" });
});
