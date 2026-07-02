const mongoose = require("mongoose");

const collectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Collection", collectionSchema);
