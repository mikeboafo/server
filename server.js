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
// Allow multiple origins including your frontend and backend
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://climate-africa.com",
  "https://www.climate-africa.com",
  "https://server-one-sandy-17.vercel.app", // Your backend URL
  "https://server-lovat-sigma.vercel.app", // Old backend (for reference)
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // For debugging, allow all origins temporarily
      callback(null, true);
      // For production: callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
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
  optionsSuccessStatus: 200
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options("*", cors(corsOptions));

// Parse JSON bodies
app.use(express.json());

// -------------------- ADD ROOT ROUTE (CRITICAL FOR VERCELL) --------------------
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Climate Africa API Server",
    status: "active",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      root: "/",
      news: "/api/news",
      latest: "/api/news/latest",
      trending: "/api/news/trending",
      auth: {
        register: "/api/auth/register",
        login: "/api/auth/login"
      }
    },
    cors: {
      allowedOrigins: allowedOrigins
    }
  });
});

// -------------------- MongoDB Connection --------------------
mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/climate-africa", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    console.log("⚠️ Running without database connection");
  });

// -------------------- Models --------------------
// Inline models for Vercel compatibility
const newsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  content: String,
  author: String,
  category: String,
  categorySlug: String,
  image: String,
  url: String,
  source: String,
  publishedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" },
  createdAt: { type: Date, default: Date.now },
});

// Use existing models or create new ones
const News = mongoose.models.News || mongoose.model("News", newsSchema);
const User = mongoose.models.User || mongoose.model("User", userSchema);

// -------------------- Upload Route --------------------
// Create a simple upload route if the external one doesn't exist
app.post("/api/upload", (req, res) => {
  res.json({ 
    message: "Upload endpoint (placeholder)", 
    note: "Configure actual file upload service" 
  });
});

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

    const token = jwt.sign(
      { id: user._id }, 
      process.env.JWT_SECRET || "fallback-secret-key-for-development",
      { expiresIn: "7d" }
    );

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

  jwt.verify(token, process.env.JWT_SECRET || "fallback-secret-key-for-development", (err, decoded) => {
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

// Fallback mock data
const mockNews = [
  {
    _id: "mock-1",
    title: "Climate Africa - API Test",
    description: "This is test data showing the API is working",
    content: "The Climate Africa API is successfully serving news content.",
    author: "System",
    category: "Technology",
    categorySlug: "technology",
    image: "https://images.unsplash.com/photo-1466611653911-95081537e5b7",
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }
];

// -------------------- NEWS ROUTES --------------------

// Get all news
app.get("/api/news", async (req, res) => {
  console.log("GET /api/news requested");
  
  try {
    if (mongoose.connection.readyState === 1) {
      const news = await News.find().sort({ createdAt: -1 }).lean();
      if (news.length > 0) {
        const cleanedNews = cleanNewsContent(news);
        return res.json(cleanedNews);
      }
    }
    // Fallback to mock data
    res.json(cleanNewsContent(mockNews));
  } catch (err) {
    console.error("Error fetching news:", err.message);
    res.json(cleanNewsContent(mockNews));
  }
});

// Get latest news (array)
app.get("/api/news/latest", async (req, res) => {
  console.log("GET /api/news/latest requested from:", req.headers.origin);
  
  try {
    if (mongoose.connection.readyState === 1) {
      const latestNews = await News.find()
        .sort({ publishedAt: -1 })
        .limit(10)
        .lean();
      if (latestNews.length > 0) {
        const cleaned = cleanNewsContent(latestNews);
        return res.json(cleaned);
      }
    }
    // Fallback to mock data
    res.json(cleanNewsContent(mockNews));
  } catch (err) {
    console.error("Error fetching latest news:", err.message);
    res.json(cleanNewsContent(mockNews));
  }
});

// Get trending news (array)
app.get("/api/news/trending", async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const trendingNews = await News.find()
        .sort({ publishedAt: -1 })
        .limit(6)
        .lean();
      if (trendingNews.length > 0) {
        const cleaned = cleanNewsContent(trendingNews);
        return res.json(cleaned);
      }
    }
    res.json(cleanNewsContent(mockNews.slice(0, 3)));
  } catch (err) {
    console.error("Error fetching trending news:", err);
    res.json(cleanNewsContent(mockNews.slice(0, 3)));
  }
});

// Get news by category slug
app.get("/api/news/category/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    if (mongoose.connection.readyState === 1) {
      const news = await News.find({ categorySlug: slug })
        .sort({ publishedAt: -1 })
        .lean();
      const cleaned = cleanNewsContent(news);
      return res.json(cleaned);
    }
    res.json([]);
  } catch (err) {
    console.error("Error fetching news by category:", err);
    res.json([]);
  }
});

// Get single news story
app.get("/api/news/:id", async (req, res) => {
  const { id } = req.params;

  try {
    let story;

    if (id === "latest") {
      if (mongoose.connection.readyState === 1) {
        story = await News.findOne().sort({ publishedAt: -1 });
      }
      if (!story) story = mockNews[0];
    } else {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid story ID" });
      }
      if (mongoose.connection.readyState === 1) {
        story = await News.findById(id);
      }
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

// Test endpoint
app.get("/api/test", (req, res) => {
  res.json({
    message: "API Test Successful!",
    backend: "server-one-sandy-17.vercel.app",
    timestamp: new Date().toISOString(),
    status: "active"
  });
});

// -------------------- Error Handling Middleware --------------------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: "Server error", 
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
  });
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ 
    message: "Route not found",
    path: req.path,
    method: req.method,
    suggestion: "Visit / for available endpoints"
  });
});

// -------------------- Start server locally --------------------
const PORT = process.env.PORT || 5000;

// Only start listening if not in Vercel environment
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 CORS configured for: ${allowedOrigins.join(', ')}`);
  });
}

// -------------------- EXPORT FOR VERCELL (CRITICAL) --------------------
module.exports = app;