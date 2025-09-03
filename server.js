// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const he = require("he"); // decode HTML entities
const striptags = require("striptags"); // remove HTML tags
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

// -------------------- MongoDB Connection --------------------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// -------------------- Models --------------------
const News = require("./models/news");
const User = require("./models/User"); // with { username, email, password }

// -------------------- Upload Route --------------------
const uploadRoute = require("./api/upload");
app.use("/api/upload", uploadRoute);

// -------------------- AUTH --------------------
// Register user
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: "Username or email already in use" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
    });
    await newUser.save();

    return res.status(201).json({
      message: "User registered successfully",
      user: { id: newUser._id, username: newUser.username, email: newUser.email },
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ message: "Server error during registration" });
  }
});

// Login user
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    return res.status(200).json({
      message: "Login successful",
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Server error during login" });
  }
});

// -------------------- Helpers --------------------
function getBearer(req) {
  const header = req.headers["authorization"] || "";
  const parts = header.split(" ");
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
  return null;
}

function authMiddleware(req, res, next) {
  const token = getBearer(req);
  if (!token) return res.status(401).json({ message: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err || !decoded?.id) return res.status(403).json({ message: "Invalid token" });
    req.userId = decoded.id;
    next();
  });
}

function cleanText(text) {
  if (!text) return text;
  let cleaned = he.decode(text);
  cleaned = striptags(cleaned);
  cleaned = cleaned
    .replace(/\\,/g, ",")
    .replace(/\\-/g, "-")
    .replace(/\\\//g, "/")
    .replace(/\/\//g, "")
    .replace(/\/\./g, ".")
    .replace(/\\\./g, ".")
    .replace(/\\:/g, ":")
    .replace(/\\;/g, ";")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\[/g, "[")
    .replace(/\\\]/g, "]")
    .replace(/\\!/g, "!")
    .replace(/\\\?/g, "?")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

function cleanNewsContent(news) {
  if (Array.isArray(news)) {
    return news.map((item) => {
      const newsObj = item.toObject ? item.toObject() : item;
      return {
        ...newsObj,
        title: cleanText(newsObj.title),
        description: cleanText(newsObj.description),
        content: cleanText(newsObj.content),
        author: cleanText(newsObj.author),
        category: cleanText(newsObj.category),
      };
    });
  }
  const newsObj = news?.toObject ? news.toObject() : news;
  return {
    ...newsObj,
    title: cleanText(newsObj?.title),
    description: cleanText(newsObj?.description),
    content: cleanText(newsObj?.content),
    author: cleanText(newsObj?.author),
    category: cleanText(newsObj?.category),
  };
}

// -------------------- NEWS ROUTES --------------------

// Get all news
app.get("/api/news", async (req, res) => {
  try {
    const news = await News.find().sort({ createdAt: -1 }).lean();
    const cleanedNews = cleanNewsContent(news);
    res.json(cleanedNews);
  } catch (err) {
    console.error("Error fetching news:", err);
    res.status(500).json({ message: "Failed to fetch news" });
  }
});

// Get single news story
app.get("/api/news/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const story = await News.findById(id).lean();
    if (!story) return res.status(404).json({ message: "Story not found" });
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

// Update news by ID
app.put("/api/news/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await News.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: "Story not found" });
    const cleaned = cleanNewsContent(updated);
    res.status(200).json(cleaned);
  } catch (err) {
    console.error("Error updating story:", err);
    res.status(500).json({ message: "Server error while updating" });
  }
});

// Delete news by ID
app.delete("/api/news/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await News.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Story not found" });
    res.status(200).json({ message: "Story deleted successfully" });
  } catch (err) {
    console.error("Error deleting story:", err);
    res.status(500).json({ message: "Server error while deleting" });
  }
});

// -------------------- Start server --------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
