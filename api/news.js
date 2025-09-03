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

    // Return with unified "body" field
    const formatted = news.map(item => ({
      _id: item._id,
      title: item.title,
      body: item.body, // 👈 unified content
      image: item.image,
      category: item.category,
      categorySlug: item.categorySlug,
      publishedAt: item.publishedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    return res.status(200).json(formatted);
  }

  if (req.method === 'POST') {
    try {
      const {
        title,
        content, // 👈 use new field
        description, // legacy, optional
        image,
        category,
        categorySlug,
        publishedAt,
      } = req.body;

      if (!title || !(content || description) || !image || !category) {
        return res.status(400).json({ message: "Missing required fields." });
      }

      const news = new News({
        title,
        content: content || description, // 👈 always store in `content`
        description, // keep for backward compatibility
        image,
        category,
        categorySlug: categorySlug || slugify(category),
        publishedAt: publishedAt || new Date().toISOString(),
      });

      await news.save();
      return res.status(201).json({
        _id: news._id,
        title: news.title,
        body: news.body, // 👈 always return unified field
        image: news.image,
        category: news.category,
        categorySlug: news.categorySlug,
        publishedAt: news.publishedAt,
        createdAt: news.createdAt,
        updatedAt: news.updatedAt,
      });

    } catch (error) {
      console.error("POST /api/news failed:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method Not Allowed" });
};

module.exports = handler;
