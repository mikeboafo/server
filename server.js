const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const he = require("he"); // decode HTML entities
const striptags = require("striptags"); // remove HTML tags

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Load Mongoose model
const News = require("./models/news");

// Image upload route
const uploadRoute = require("./api/upload");
app.use("/api/upload", uploadRoute);

// Helper function to clean HTML from news content
function cleanNewsContent(news) {
  if (Array.isArray(news)) {
    return news.map(item => ({
      ...item._doc,
      content: item.content ? striptags(he.decode(item.content)) : item.content
    }));
  }
  return {
    ...news._doc,
    content: news.content ? striptags(he.decode(news.content)) : news.content
  };
}

// Get all news
app.get("/api/news", async (req, res) => {
  try {
    const news = await News.find().sort({ createdAt: -1 });
    const cleanedNews = cleanNewsContent(news);
    res.json(cleanedNews);
  } catch (err) {
    console.error("Error fetching news:", err);
    res.status(500).json({ message: "Failed to fetch news" });
  }
});

// Get single news story by ID
app.get("/api/news/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const story = await News.findById(id);

    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }

    const cleanedStory = cleanNewsContent(story);
    res.status(200).json(cleanedStory);
  } catch (err) {
    console.error("Error fetching single story:", err);
    res.status(500).json({ message: "Failed to fetch story" });
  }
});

// Create news
app.post("/api/news", async (req, res) => {
  try {
    const news = new News(req.body);
    await news.save();
    res.status(201).json(news);
  } catch (err) {
    console.error("Error saving news:", err);
    res.status(400).json({ message: "Validation failed", error: err.message });
  }
});

// Delete news by ID
app.delete("/api/news/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await News.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Story not found" });
    }

    res.status(200).json({ message: "Story deleted successfully" });
  } catch (err) {
    console.error("Error deleting story:", err);
    res.status(500).json({ message: "Server error while deleting" });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
