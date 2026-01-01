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

// -------------------- CORS Configuration --------------------
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000https://climate-africa.com/", 
  credentials: true, 
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "Access-Control-Allow-Headers",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers"
  ],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options("*", cors(corsOptions));

// Parse JSON bodies
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

// Get latest news (array)
app.get("/api/news/latest", async (req, res) => {
  try {
    const latestNews = await News.find()
      .sort({ publishedAt: -1 })
      .limit(10)
      .lean();
    const cleaned = cleanNewsContent(latestNews);
    res.json(cleaned); // always return array
  } catch (err) {
    console.error("Error fetching latest news:", err);
    res.status(500).json({ message: "Failed to fetch latest news" });
  }
});

// Get trending news (array)
app.get("/api/news/trending", async (req, res) => {
  try {
    const trendingNews = await News.find()
      .sort({ publishedAt: -1 }) // can later use views/likes
      .limit(6)
      .lean();
    const cleaned = cleanNewsContent(trendingNews);
    res.json(cleaned); // always return array
  } catch (err) {
    console.error("Error fetching trending news:", err);
    res.status(500).json({ message: "Failed to fetch trending news" });
  }
});

// Get news by category slug
app.get("/api/news/category/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const news = await News.find({ categorySlug: slug })
      .sort({ publishedAt: -1 })
      .lean();
    const cleaned = cleanNewsContent(news);
    res.json(cleaned);
  } catch (err) {
    console.error("Error fetching news by category:", err);
    res.status(500).json({ message: "Failed to fetch news by category" });
  }
});


// Get single news story
app.get("/api/news/:id", async (req, res) => {
  const { id } = req.params;

  try {
    let story;

    if (id === "latest") {
      story = await News.findOne().sort({ publishedAt: -1 });
    } else {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid story ID" });
      }
      story = await News.findById(id);
    }

    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }

    res.json(story);
  } catch (err) {
    console.error("Error fetching story:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Create news (protected - requires authentication)
app.post("/api/news", authMiddleware, async (req, res) => {
  try {
    const news = new News(req.body);
    await news.save();
    res.status(201).json(news);
  } catch (err) {
    console.error("Error saving news:", err);
    res.status(400).json({ message: "Validation failed", error: err.message });
  }
});

// Update news by ID (protected - requires authentication)
app.put("/api/news/:id", authMiddleware, async (req, res) => {
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

// Delete news by ID (protected - requires authentication)
app.delete("/api/news/:id", authMiddleware, async (req, res) => {
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

// -------------------- Error Handling Middleware --------------------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!", error: err.message });
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// -------------------- Start server --------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 CORS configured for: ${corsOptions.origin}`);
});