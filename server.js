// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

/* =========================================================
   CORS CONFIGURATION (SINGLE SOURCE OF TRUTH)
========================================================= */
const allowedOrigins = [
  "https://climate-africa.com",
  "http://localhost:3000",
  "http://localhost:5173"
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

/* =========================================================
   MIDDLEWARE
========================================================= */
app.use(express.json());

/* =========================================================
   ROOT ROUTE
========================================================= */
app.get("/", (req, res) => {
  res.json({
    name: "Climate Africa API",
    status: "active",
    timestamp: new Date().toISOString(),
    endpoints: {
      news: "/api/news",
      latest: "/api/news/latest",
      trending: "/api/news/trending",
      auth: "/api/auth"
    }
  });
});

/* =========================================================
   TEST ROUTE
========================================================= */
app.get("/api/test", (req, res) => {
  res.json({
    message: "API is working",
    env: process.env.NODE_ENV || "development",
    time: new Date().toISOString()
  });
});

/* =========================================================
   DATABASE CONNECTION (OPTIONAL)
========================================================= */
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch(err => {
      console.error("❌ MongoDB error:", err.message);
      console.log("⚠️ Running without database");
    });
} else {
  console.log("⚠️ No MongoDB URI provided");
}

/* =========================================================
   MODELS
========================================================= */
const newsSchema = new mongoose.Schema({
  title: String,
  description: String,
  content: String,
  author: String,
  category: String,
  categorySlug: String,
  image: String,
  publishedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const News = mongoose.models.News || mongoose.model("News", newsSchema);
const User = mongoose.models.User || mongoose.model("User", userSchema);

/* =========================================================
   MOCK DATA (FALLBACK)
========================================================= */
const mockNews = [
  {
    _id: "mock-1",
    title: "Climate Africa News",
    description: "Your source for climate news in Africa",
    content: "This is fallback content when DB is unavailable.",
    author: "Admin",
    category: "General",
    categorySlug: "general",
    image: "https://images.unsplash.com/photo-1466611653911-95081537e5b7",
    publishedAt: new Date(),
    createdAt: new Date()
  }
];

/* =========================================================
   NEWS ROUTES
========================================================= */
app.get("/api/news", async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const news = await News.find().sort({ createdAt: -1 }).lean();
      return res.json(news.length ? news : mockNews);
    }
    res.json(mockNews);
  } catch (err) {
    console.error(err);
    res.json(mockNews);
  }
});

app.get("/api/news/latest", async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const news = await News.find()
        .sort({ publishedAt: -1 })
        .limit(10)
        .lean();
      return res.json(news.length ? news : mockNews);
    }
    res.json(mockNews);
  } catch (err) {
    console.error(err);
    res.json(mockNews);
  }
});

app.get("/api/news/trending", async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const news = await News.find()
        .sort({ publishedAt: -1 })
        .limit(6)
        .lean();
      return res.json(news.length ? news : mockNews.slice(0, 3));
    }
    res.json(mockNews.slice(0, 3));
  } catch (err) {
    console.error(err);
    res.json(mockNews.slice(0, 3));
  }
});

app.get("/api/news/category/:slug", async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const news = await News.find({ categorySlug: req.params.slug })
        .sort({ publishedAt: -1 })
        .lean();
      return res.json(news);
    }
    res.json([]);
  } catch (err) {
    console.error(err);
    res.json([]);
  }
});

app.get("/api/news/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    if (mongoose.connection.readyState === 1) {
      const story = await News.findById(req.params.id);
      if (story) return res.json(story);
    }

    res.status(404).json({ message: "Story not found" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================================================
   AUTH ROUTES
========================================================= */
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ message: "All fields required" });

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists)
      return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password: hashed });

    res.status(201).json({
      message: "Registered successfully",
      user: { id: user._id, email: user.email }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user._id, email: user.email }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed" });
  }
});

/* =========================================================
   404 + ERROR HANDLING
========================================================= */
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

/* =========================================================
   START SERVER (LOCAL ONLY)
========================================================= */
const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
