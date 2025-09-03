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
// Register user (hash in route)
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check for existing by username OR email
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: "Username or email already in use" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
    });
    await newUser.save();

    // (Optional) issue token on register:
    // const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    return res.status(201).json({
      message: "User registered successfully",
      user: { id: newUser._id, username: newUser.username, email: newUser.email },
      // token
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ message: "Server error during registration" });
  }
});

// Login user (returns JWT + user)
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    // Create JWT
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

// Extract Bearer token helper
function getBearer(req) {
  const header = req.headers["authorization"] || "";
  const parts = header.split(" ");
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
  return null;
}

// Auth middleware (use on protected routes)
function authMiddleware(req, res, next) {
  const token = getBearer(req);
  if (!token) return res.status(401).json({ message: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err || !decoded?.id) return res.status(403).json({ message: "Invalid token" });
    req.userId = decoded.id;
    next();
  });
}

// -------------------- Helpers (your original cleaning logic) --------------------
function cleanText(text) {
  if (!text) return text;

  let cleaned = text;

  // Decode HTML entities like &nbsp;
  cleaned = he.decode(cleaned);

  // Remove HTML tags (but preserve content)
  cleaned = striptags(cleaned);

  // Fix escaped characters and encoding issues
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

// -------------------- NEWS ROUTES (kept same, cleaned output) --------------------

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

// Get single news story by ID
app.get("/api/news/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const story = await News.findById(id).lean();

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
// If you want to restrict to logged-in users, add authMiddleware as the second arg:
// app.post("/api/news", authMiddleware, async (req, res) => {
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
// If you want to restrict to logged-in users, add authMiddleware as the second arg:
// app.delete("/api/news/:id", authMiddleware, async (req, res) => {
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

// -------------------- Start server --------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
