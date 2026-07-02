const asyncHandler = require("express-async-handler");
const Query = require("../models/Query");

// POST /api/queries
// Public route - anyone can contact
exports.create = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    res.status(400);
    throw new Error("Please provide name, email, subject, and message");
  }

  const query = await Query.create({ name, email, subject, message });

  res.status(201).json({
    success: true,
    message: "Message received successfully",
    query,
  });
});

// GET /api/queries
// Admin-only route
exports.list = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20, search, showDeleted = "false" } = req.query;

  const q = {};
  if (showDeleted === "true") {
    q.isDeleted = true;
  } else if (showDeleted === "false") {
    q.isDeleted = { $ne: true };
  }
  if (status) q.status = status;

  if (search) {
    q.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { subject: { $regex: search, $options: "i" } },
      { message: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Query.find(q).sort("-createdAt").skip(skip).limit(Number(limit)),
    Query.countDocuments(q),
  ]);

  res.json({
    items,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  });
});

// PUT /api/queries/:id
// Admin-only route
exports.update = asyncHandler(async (req, res) => {
  const query = await Query.findById(req.params.id);
  if (!query || query.isDeleted) {
    res.status(404);
    throw new Error("Query not found");
  }

  query.status = req.body.status || query.status;
  query.adminNotes = req.body.adminNotes !== undefined ? req.body.adminNotes : query.adminNotes;

  const updatedQuery = await query.save();

  res.json(updatedQuery);
});

// DELETE /api/queries/:id
// Admin-only route (Soft Delete)
exports.remove = asyncHandler(async (req, res) => {
  const query = await Query.findById(req.params.id);
  if (!query) {
    res.status(404);
    throw new Error("Query not found");
  }

  query.isDeleted = true;
  query.deletedAt = new Date();
  await query.save();

  res.json({ success: true, message: "Query soft-deleted successfully", query });
});

// POST /api/queries/:id/restore
// Admin-only route
exports.restore = asyncHandler(async (req, res) => {
  const query = await Query.findById(req.params.id);
  if (!query) {
    res.status(404);
    throw new Error("Query not found");
  }

  query.isDeleted = false;
  query.deletedAt = null;
  await query.save();

  res.json({ success: true, message: "Query restored successfully", query });
});
