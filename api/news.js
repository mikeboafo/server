const mongoose = require('mongoose');
const News = require('../models/news');

let conn = null;

const slugify = (text) =>
  text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '');

const handler = async (req, res) => {
  if (!conn) {
    conn = await mongoose.connect(process.env.MONGO_URI);
  }

  // Optional CORS setup
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === 'GET') {
    const news = await News.find().sort({ createdAt: -1 });
    return res.status(200).json(news);
  }

  if (req.method === 'POST') {
    try {
      const {
        title,
        description,
        image,
        category,
        categorySlug,
        publishedAt,
      } = req.body;

      if (!title || !description || !image || !category) {
        return res.status(400).json({ message: "Missing required fields." });
      }

      const news = new News({
        title,
        description,
        image,
        category,
        categorySlug: categorySlug || slugify(category),
        publishedAt: publishedAt || new Date().toISOString(),
      });

      await news.save();
      return res.status(201).json(news);

    } catch (error) {
      console.error("POST /api/news failed:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method Not Allowed" });
};

module.exports = handler;
