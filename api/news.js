const News = require('../mod');
const mongoose = require('mongoose');

let conn = null;

const handler = async (req, res) => {
  if (!conn) {
    conn = await mongoose.connect(process.env.MONGO_URI);
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === 'GET') {
    // Get category slug from query
    const { slug } = req.query;

    const filter = slug ? { categorySlug: slug } : {};
    const news = await News.find(filter).sort({ createdAt: -1 });

    const formatted = news.map(item => ({
      _id: item._id,
      title: item.title,
      body: item.content, // always use content
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
      const { title, content, description, image, category, categorySlug, publishedAt } = req.body;

      if (!title || !(content || description) || !image || !category) {
        return res.status(400).json({ message: "Missing required fields." });
      }

      const news = new News({
        title,
        content: content || description,
        description,
        image,
        category,
        categorySlug: categorySlug || category.toLowerCase().trim().replace(/\s+/g, '-'),
        publishedAt: publishedAt || new Date(),
      });

      await news.save();

      return res.status(201).json({
        _id: news._id,
        title: news.title,
        body: news.content,
        image: news.image,
        category: news.category,
        categorySlug: news.categorySlug,
        publishedAt: news.publishedAt,
        createdAt: news.createdAt,
        updatedAt: news.updatedAt,
      });

    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method Not Allowed" });
};

module.exports = handler;
