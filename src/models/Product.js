const mongoose = require("mongoose");

// Each color variant carries its own gallery (front/side/back/top/sole/lifestyle).
const viewSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      enum: ["Front", "Side", "Back", "Top", "Sole", "Lifestyle"],
      required: true,
    },
    url: { type: String, required: true },
    publicId: String,
  },
  { _id: false },
);

const colorVariantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    hex: { type: String, required: true, match: /^#([0-9a-fA-F]{3}){1,2}$/ },
    images: { type: [viewSchema], default: [] },
    stock: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: "text" },
    artNumber: { type: String, required: true, trim: true, index: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, required: true },
    brand: { type: String, default: "MOCS" },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    collection: String,
    price: { type: Number, required: true, min: 0 },
    oldPrice: { type: Number, min: 0 },
    shippingCharge: { type: Number, default: 0, min: 0 },
    promo1: { type: String, default: "Easy shipping" },
    promo2: { type: String, default: "3-day returns" },
    promo3: { type: String, default: "3-months warranty" },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    stock: { type: Number, default: 0, min: 0 },
    colors: { type: [colorVariantSchema], default: [] },
    sizes: { type: [Number], default: [] },
    outOfStockSizes: { type: [Number], default: [] },
    coverImage: { type: String, required: true },
    additionalImages: {
      type: [
        {
          label: { type: String, required: true },
          url: { type: String, required: true },
          publicId: String,
        },
      ],
      default: [],
    },
    isNew: { type: Boolean, default: false },
    isTrending: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  { timestamps: true },
);

productSchema.index(
  {
    name: "text",
    description: "text",
    brand: "text",
    collection: "text",
    artNumber: "text",
    "colors.name": "text",
  },
  {
    weights: {
      name: 10,
      artNumber: 8,
      collection: 6,
      "colors.name": 5,
      brand: 4,
      description: 2,
    },
    name: "ProductSearchTextIndex",
  },
);

productSchema.index({ category: 1, price: 1 });

module.exports = mongoose.model("Product", productSchema);
