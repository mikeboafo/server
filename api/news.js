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
    const { title, content, imageUrl } = req.body;
    const news = new News({ title, content, imageUrl });
    await news.save();
    return res.status(201).json(news);
  }

  return res.status(405).end(); 
};

module.exports = handler;
