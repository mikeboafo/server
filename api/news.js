const mongoose = require('mongoose');
const News = require('../models/news');

let conn = null;

const handler = async (req, res) => {
  if (!conn) {
    conn = await mongoose.connect(process.env.MONGO_URI);
  }

  if (req.method === 'GET') {
    const news = await News.find().sort({ createdAt: -1 });
    return res.status(200).json(news);
  }

  if (req.method === 'POST') {
    try {
      const {
        title,
        description,     // formerly "content"
        image,           // formerly "imageUrl"
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
        categorySlug,
        publishedAt: publishedAt || new Date().toISOString(),
      });

      await news.save();
      return res.status(201).json(news);

    } catch (error) {
      console.error("POST /api/news failed:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).end(); // Method Not Allowed
};

module.exports = handler;
