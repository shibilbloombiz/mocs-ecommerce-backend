require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("./models/Product");
const Category = require("./models/Category");
const Collection = require("./models/Collection");

const seedProducts = async () => {
  const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/mocs";

  try {
    console.log("Connecting to Database...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected.");

    console.log("Clearing existing products, categories, and collections...");
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Collection.deleteMany({});
    console.log("Database cleared.");

    // Seed Collections
    const collectionsList = ["Sandals", "Heels", "Sports", "Casual", "Formal", "Sneakers", "Boots", "Trending", "New Arrival"];
    for (const name of collectionsList) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
      await Collection.create({ name, slug, description: `${name} footwear collection` });
    }
    console.log("Collections seeded.");

    const menCat = await Category.create({ name: "Men", slug: "men", description: "Men's collection" });
    const womenCat = await Category.create({ name: "Women", slug: "women", description: "Women's collection" });
    const kidsCat = await Category.create({ name: "Kids", slug: "kids", description: "Kids' collection" });

    const items = [
      {
        name: "Ladies Casual Luxe",
        artNumber: "9056",
        slug: "ladies-casual-luxe-black",
        description: "Step into comfort and style with these sleek Ladies Casual Luxe footwear. Perfect for everyday casual wear.",
        brand: "MOCS",
        collection: "Casual",
        price: 399,
        stock: 11,
        coverImage: "https://images.unsplash.com/photo-1542291026-7eec264c27ff",
        category: womenCat._id,
        colors: [
          { name: "Black", hex: "#000000", stock: 11 }
        ],
        sizes: [7, 8, 9, 10, 11]
      },
      {
        name: "Ladies Casual Luxe",
        artNumber: "9056",
        slug: "ladies-casual-luxe-cream",
        description: "Step into comfort and style with these sleek Ladies Casual Luxe footwear. Perfect for everyday casual wear.",
        brand: "MOCS",
        collection: "Casual",
        price: 399,
        stock: 12,
        coverImage: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a",
        category: womenCat._id,
        colors: [
          { name: "Cream", hex: "#FFFDD0", stock: 12 }
        ],
        sizes: [7, 8, 9, 10, 11]
      },
      {
        name: "Ladies Casual Luxe",
        artNumber: "9056",
        slug: "ladies-casual-luxe-maroon",
        description: "Step into comfort and style with these sleek Ladies Casual Luxe footwear. Perfect for everyday casual wear.",
        brand: "MOCS",
        collection: "Casual",
        price: 399,
        stock: 8,
        coverImage: "https://images.unsplash.com/photo-1608231387042-66d1773070a5",
        category: womenCat._id,
        colors: [
          { name: "Maroon", hex: "#800000", stock: 8 }
        ],
        sizes: [7, 8, 9, 10, 11]
      },
      {
        name: "Urban Ease Comfort Sandals",
        artNumber: "9057",
        slug: "urban-ease-comfort-sandals-black",
        description: "Experience ultimate comfort with the Urban Ease Comfort Sandals. Designed for support and ventilation.",
        brand: "MOCS",
        collection: "Casual",
        price: 299,
        stock: 15,
        coverImage: "https://images.unsplash.com/photo-1539185441755-769473a23570",
        category: womenCat._id,
        colors: [
          { name: "Black", hex: "#000000", stock: 15 }
        ],
        sizes: [6, 7, 8, 9, 10]
      },
      {
        name: "Urban Ease Comfort Sandals",
        artNumber: "9057",
        slug: "urban-ease-comfort-sandals-brown",
        description: "Experience ultimate comfort with the Urban Ease Comfort Sandals. Designed for support and ventilation.",
        brand: "MOCS",
        collection: "Casual",
        price: 299,
        stock: 10,
        coverImage: "https://images.unsplash.com/photo-1549298916-b41d501d3772",
        category: womenCat._id,
        colors: [
          { name: "Brown", hex: "#78350F", stock: 10 }
        ],
        sizes: [6, 7, 8, 9, 10]
      },
      {
        name: "Buckle Bliss Comfort Slides",
        artNumber: "9058",
        slug: "buckle-bliss-comfort-slides-beige",
        description: "Buckle Bliss Comfort Slides combine fashion-forward double-buckle styling with plush cushioned footbed.",
        brand: "MOCS",
        collection: "Casual",
        price: 249,
        stock: 14,
        coverImage: "https://images.unsplash.com/photo-1603808033192-082d6f74b302",
        category: womenCat._id,
        colors: [
          { name: "Beige", hex: "#F5F5DC", stock: 14 }
        ],
        sizes: [5, 6, 7, 8, 9]
      },
      {
        name: "Buckle Bliss Comfort Slides",
        artNumber: "9058",
        slug: "buckle-bliss-comfort-slides-lavender",
        description: "Buckle Bliss Comfort Slides combine fashion-forward double-buckle styling with plush cushioned footbed.",
        brand: "MOCS",
        collection: "Casual",
        price: 249,
        stock: 9,
        coverImage: "https://images.unsplash.com/photo-1533867617858-e7b97e060509",
        category: womenCat._id,
        colors: [
          { name: "Lavender Purple", hex: "#8B5CF6", stock: 9 }
        ],
        sizes: [5, 6, 7, 8, 9]
      },
      {
        name: "Buckle Bliss Comfort Slides",
        artNumber: "9058",
        slug: "buckle-bliss-comfort-slides-mehandi",
        description: "Buckle Bliss Comfort Slides combine fashion-forward double-buckle styling with plush cushioned footbed.",
        brand: "MOCS",
        collection: "Casual",
        price: 249,
        stock: 7,
        coverImage: "https://images.unsplash.com/photo-1542291026-7eec264c27ff",
        category: womenCat._id,
        colors: [
          { name: "Mehandi", hex: "#808000", stock: 7 }
        ],
        sizes: [5, 6, 7, 8, 9]
      }
    ];

    console.log("Seeding products...");
    for (const item of items) {
      await Product.create(item);
      console.log(`Seeded: ${item.name}`);
    }
    console.log("Products seeded successfully.");
  } catch (error) {
    console.error("Seeding products failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from database.");
    process.exit(0);
  }
};

seedProducts();
