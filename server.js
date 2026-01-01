// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

/* =========================================================
   CORS CONFIGURATION (FIXED VERSION)
========================================================= */
const allowedOrigins = [
  "https://climate-africa.com",
  "http://localhost:3000",
  "http://localhost:5173"
];

// Apply CORS middleware with proper configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.log(`🚫 CORS blocked origin: ${origin}`);
      return callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  exposedHeaders: ["Content-Length", "Content-Type"],
  maxAge: 86400 // 24 hours for preflight cache
}));

// Explicitly handle OPTIONS preflight requests
app.options("*", cors());

/* =========================================================
   MIDDLEWARE
========================================================= */
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

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
      categories: "/api/news/category/:slug",
      auth: "/api/auth"
    },
    cors: {
      allowedOrigins: allowedOrigins,
      status: "enabled"
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
    time: new Date().toISOString(),
    cors: "enabled",
    origin: req.headers.origin || "no origin header"
  });
});

/* =========================================================
   DATABASE CONNECTION
========================================================= */
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
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
  url: String,
  source: String,
  publishedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  status: { type: String, default: "published" },
  featured: { type: Boolean, default: false },
  readTime: { type: Number, default: 5 },
  region: String,
  tags: [String]
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" },
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
    createdAt: new Date(),
    status: "published",
    featured: true,
    readTime: 5,
    region: "Pan-Africa",
    source: "Climate Africa",
    url: "https://climate-africa.com"
  }
];

/* =========================================================
   DEBUG & UTILITY ENDPOINTS
========================================================= */
app.get("/api/debug/connection", async (req, res) => {
  try {
    const dbInfo = {
      environment: process.env.NODE_ENV || 'development',
      mongodbUri: process.env.MONGODB_URI ? 'Set (hidden)' : 'Not set',
      mongoUriLength: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0,
      connectionState: mongoose.connection.readyState,
      connectionStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState],
      databaseName: mongoose.connection.db ? mongoose.connection.db.databaseName : 'Not connected',
      host: mongoose.connection.host || 'Not connected',
      port: mongoose.connection.port || 'Not connected'
    };
    
    if (mongoose.connection.readyState === 1) {
      const collections = await mongoose.connection.db.listCollections().toArray();
      dbInfo.collections = collections.map(c => c.name);
      dbInfo.collectionCount = collections.length;
      
      const newsCount = await News.countDocuments();
      dbInfo.newsCount = newsCount;
      
      const sampleNews = await News.find().limit(2);
      dbInfo.sampleNews = sampleNews;
    }
    
    res.json(dbInfo);
    
  } catch (error) {
    res.json({
      error: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
});

app.get("/api/debug/categories-full", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ error: "Database not connected" });
    }
    
    const allDocs = await News.find({}, 'category categorySlug title').limit(20);
    
    const categories = {};
    allDocs.forEach(doc => {
      if (!categories[doc.category]) {
        categories[doc.category] = {
          category: doc.category,
          slug: doc.categorySlug,
          count: 0,
          examples: []
        };
      }
      categories[doc.category].count++;
      if (categories[doc.category].examples.length < 3) {
        categories[doc.category].examples.push({
          title: doc.title,
          slug: doc.categorySlug
        });
      }
    });
    
    const categoryList = Object.values(categories);
    
    const regionalNews = await News.find({ 
      $or: [
        { categorySlug: 'regional-climate-news' },
        { categorySlug: /regional.*climate.*news/i },
        { category: /regional.*climate.*news/i }
      ]
    });
    
    res.json({
      totalCategories: categoryList.length,
      categories: categoryList,
      regionalClimateNews: {
        lookingFor: 'regional-climate-news',
        exactMatch: await News.countDocuments({ categorySlug: 'regional-climate-news' }),
        caseInsensitive: await News.countDocuments({ 
          categorySlug: { $regex: /regional.*climate.*news/i } 
        }),
        categoryMatch: await News.countDocuments({ 
          category: { $regex: /regional.*climate.*news/i } 
        }),
        foundDocs: regionalNews.map(doc => ({
          title: doc.title,
          category: doc.category,
          categorySlug: doc.categorySlug
        }))
      }
    });
    
  } catch (error) {
    res.json({ error: error.message });
  }
});

app.get("/api/available-categories", async (req, res) => {
  try {
    const categoriesWithData = await News.aggregate([
      { $match: { category: { $exists: true, $ne: "" } } },
      { 
        $group: {
          _id: "$categorySlug",
          name: { $first: "$category" },
          count: { $sum: 1 },
          latest: { $max: "$publishedAt" }
        }
      },
      { 
        $project: {
          slug: "$_id",
          name: { $trim: { input: "$name" } },
          count: 1,
          latest: 1,
          _id: 0
        }
      },
      { $sort: { count: -1, name: 1 } }
    ]);

    res.json({
      success: true,
      categories: categoriesWithData,
      total: categoriesWithData.length
    });

  } catch (error) {
    console.error("Error fetching categories:", error);
    res.json({
      success: false,
      categories: [],
      error: error.message
    });
  }
});

/* =========================================================
   TEST ENDPOINT FOR SPECIFIC CATEGORY
========================================================= */
app.get("/api/test-category/:slug", async (req, res) => {
  try {
    const slug = req.params.slug;
    
    // First, check database connection
    const dbConnected = mongoose.connection.readyState === 1;
    
    if (!dbConnected) {
      return res.json({
        test: "FAILED",
        reason: "Database not connected",
        connectionState: mongoose.connection.readyState
      });
    }
    
    // Check if ANY data exists
    const totalNews = await News.countDocuments();
    
    // Check for specific slug
    const exactMatch = await News.countDocuments({ categorySlug: slug });
    
    // Get all slugs for debugging
    const allSlugs = await News.distinct("categorySlug");
    
    // Get sample of what exists
    const sampleDocs = await News.find().limit(3).select('title categorySlug category');
    
    res.json({
      test: "COMPLETE",
      database: {
        connected: true,
        totalDocuments: totalNews
      },
      search: {
        slug: slug,
        exactMatches: exactMatch,
        allAvailableSlugs: allSlugs,
        slugExists: allSlugs.includes(slug)
      },
      sampleData: sampleDocs,
      suggestions: exactMatch === 0 ? [
        `Slug "${slug}" not found in database.`,
        `Available slugs: ${allSlugs.join(', ')}`,
        `Try: ${allSlugs[0] || 'No slugs available'}`
      ] : [`Found ${exactMatch} documents with slug "${slug}"`]
    });
    
  } catch (error) {
    res.json({
      test: "ERROR",
      error: error.message
    });
  }
});

/* =========================================================
   CATEGORY POPULATION ENDPOINT (TEMPORARY)
========================================================= */
app.post("/api/admin/populate-categories", async (req, res) => {
  try {
    const frontendCategories = [
      {
        category: "Regional Climate News",
        categorySlug: "regional-climate-news",
        sampleTitle: "East Africa Faces Unprecedented Drought Conditions",
        sampleDescription: "Severe drought affecting millions across East African nations"
      },
      {
        category: "Policy & Governance",
        categorySlug: "policy-governance",
        sampleTitle: "New Climate Policy Framework Adopted by ECOWAS",
        sampleDescription: "West African nations unite on climate action plan"
      },
      {
        category: "Environment & Biodiversity",
        categorySlug: "environment-biodiversity",
        sampleTitle: "Congo Basin Forest Protection Initiative Launched",
        sampleDescription: "New conservation efforts for world's second largest rainforest"
      },
      {
        category: "Agriculture & Food Security",
        categorySlug: "agriculture-food-security",
        sampleTitle: "Climate-Resilient Crops Boost Farm Yields in Sahel",
        sampleDescription: "New drought-resistant varieties helping farmers adapt"
      },
      {
        category: "Energy & Sustainability",
        categorySlug: "energy-sustainability",
        sampleTitle: "Solar Power Revolution in Rural Africa",
        sampleDescription: "Off-grid solutions bringing electricity to remote communities"
      },
      {
        category: "Human Stories & Community Impact",
        categorySlug: "human-stories-community-impact",
        sampleTitle: "Women Farmers Leading Climate Adaptation in Kenya",
        sampleDescription: "Community-based solutions making a difference"
      },
      {
        category: "Science & Research",
        categorySlug: "science-research",
        sampleTitle: "New Climate Modeling for African Weather Patterns",
        sampleDescription: "Research improving regional climate predictions"
      },
      {
        category: "Solutions & Innovation",
        categorySlug: "solutions-innovation",
        sampleTitle: "AI-Powered Early Warning Systems Save Lives",
        sampleDescription: "Technology helping predict and prevent climate disasters"
      }
    ];

    const results = [];
    const addedDocuments = [];

    for (const cat of frontendCategories) {
      const existingCount = await News.countDocuments({ 
        categorySlug: cat.categorySlug 
      });

      if (existingCount === 0) {
        const sampleDoc = {
          title: cat.sampleTitle,
          description: cat.sampleDescription,
          content: `This is sample content for ${cat.category}. More details about this topic would go here. This demonstrates that the ${cat.category} category is working properly in the Climate Africa news system.`,
          author: "Climate Africa Team",
          category: cat.category,
          categorySlug: cat.categorySlug,
          image: "https://images.unsplash.com/photo-1466611653911-95081537e5b7",
          publishedAt: new Date(),
          source: "Climate Africa Research",
          url: `https://climate-africa.com/news/${cat.categorySlug}`,
          region: ["East Africa", "West Africa", "Southern Africa"][Math.floor(Math.random() * 3)],
          readTime: Math.floor(Math.random() * 5) + 3,
          status: "published",
          featured: Math.random() > 0.7
        };

        const newDoc = await News.create(sampleDoc);
        addedDocuments.push(newDoc);
        results.push({
          category: cat.category,
          slug: cat.categorySlug,
          status: "ADDED",
          id: newDoc._id
        });
      } else {
        results.push({
          category: cat.category,
          slug: cat.categorySlug,
          status: "EXISTS",
          count: existingCount
        });
      }
    }

    const allSlugs = await News.distinct("categorySlug");
    const allCategories = await News.distinct("category");

    res.json({
      success: true,
      message: "Category population complete",
      results: results,
      summary: {
        added: results.filter(r => r.status === "ADDED").length,
        existing: results.filter(r => r.status === "EXISTS").length,
        totalCategories: allCategories.length,
        allSlugs: allSlugs,
        testUrls: frontendCategories.map(cat => `/api/news/category/${cat.categorySlug}`)
      },
      addedDocuments: addedDocuments
    });

  } catch (error) {
    console.error("Error populating categories:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.post("/api/admin/cleanup-categories", async (req, res) => {
  try {
    const result = await News.updateMany(
      { category: { $regex: /\s+$/ } },
      [{ $set: { category: { $trim: { input: "$category" } } } }]
    );
    
    res.json({
      success: true,
      message: "Cleaned up category names",
      modified: result.modifiedCount
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
        .where({ featured: true })
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

// FIXED CATEGORY ROUTE WITH PROPER CORS HANDLING
app.get("/api/news/category/:slug", async (req, res) => {
  const slug = req.params.slug;
  const requestOrigin = req.headers.origin || 'unknown';
  
  console.log(`🚀 Category endpoint called: ${slug} from ${requestOrigin} at ${new Date().toISOString()}`);
  
  try {
    if (mongoose.connection.readyState === 1) {
      console.log(`🔍 Searching for categorySlug: "${slug}"`);
      
      // Try exact match first
      let news = await News.find({ categorySlug: slug })
        .sort({ publishedAt: -1 })
        .lean();
      
      console.log(`📊 Found ${news.length} documents with exact match`);
      
      // If no exact match, try more flexible searches
      if (news.length === 0) {
        console.log(`❌ No exact match for "${slug}". Trying flexible searches...`);
        
        // 1. Try case-insensitive slug match
        news = await News.find({ 
          categorySlug: { $regex: new RegExp(`^${slug}$`, 'i') } 
        })
        .sort({ publishedAt: -1 })
        .lean();
        
        if (news.length > 0) {
          console.log(`✅ Found ${news.length} with case-insensitive slug match`);
        } else {
          // 2. Try partial slug match
          news = await News.find({ 
            categorySlug: { $regex: new RegExp(slug.replace(/-/g, '.*'), 'i') } 
          })
          .sort({ publishedAt: -1 })
          .lean();
          
          if (news.length > 0) {
            console.log(`✅ Found ${news.length} with partial slug match`);
          } else {
            // 3. Try category name match
            const normalizedCategory = slug
              .replace(/-/g, ' ')
              .replace(/\b\w/g, l => l.toUpperCase());
            
            news = await News.find({ 
              category: { $regex: new RegExp(normalizedCategory, 'i') } 
            })
            .sort({ publishedAt: -1 })
            .lean();
            
            if (news.length > 0) {
              console.log(`✅ Found ${news.length} with category name match`);
            }
          }
        }
        
        // Log what's available for debugging
        if (news.length === 0) {
          const allSlugs = await News.distinct("categorySlug");
          const allCategories = await News.distinct("category");
          console.log(`📋 Available slugs: ${JSON.stringify(allSlugs)}`);
          console.log(`📋 Available categories: ${JSON.stringify(allCategories)}`);
          
          // Return helpful error info
          return res.json({
            success: false,
            data: [],
            message: `No news found for category: ${slug}`,
            debug: {
              requestedSlug: slug,
              availableSlugs: allSlugs,
              availableCategories: allCategories,
              suggestion: `Try one of these: ${allSlugs.join(', ') || 'No categories available'}`
            }
          });
        }
      }
      
      // Add cache headers for browser caching (optional, helps performance)
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
      
      // Return successful response
      console.log(`🎯 Returning ${news.length} documents for category: ${slug}`);
      return res.json({
        success: true,
        data: news,
        count: news.length,
        category: slug,
        timestamp: new Date().toISOString()
      });
      
    } else {
      console.log("❌ Database not connected");
      return res.json({
        success: false,
        data: mockNews,
        message: "Database not connected, using mock data",
        dbState: mongoose.connection.readyState,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (err) {
    console.error("🔥 Category route error:", err);
    return res.json({
      success: false,
      data: mockNews,
      message: "Server error, using mock data",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get all categories endpoint
app.get("/api/news/categories", async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const categories = await News.aggregate([
        {
          $group: {
            _id: "$categorySlug",
            name: { $first: "$category" },
            count: { $sum: 1 },
            latestArticle: { $max: "$publishedAt" }
          }
        },
        {
          $project: {
            slug: "$_id",
            name: 1,
            count: 1,
            latestArticle: 1,
            _id: 0
          }
        },
        { $sort: { count: -1 } }
      ]);
      
      return res.json({
        success: true,
        categories: categories,
        total: categories.length
      });
    }
    
    // Return mock categories if DB not connected
    const mockCategories = [
      { slug: "regional-climate-news", name: "Regional Climate News", count: 5, latestArticle: new Date() },
      { slug: "science-research", name: "Science & Research", count: 3, latestArticle: new Date() },
      { slug: "policy-governance", name: "Policy & Governance", count: 2, latestArticle: new Date() }
    ];
    
    res.json({
      success: true,
      categories: mockCategories,
      total: mockCategories.length,
      source: "mock"
    });
    
  } catch (err) {
    console.error(err);
    res.json({
      success: false,
      categories: [],
      error: err.message
    });
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

// Admin CRUD endpoints
app.post("/api/admin/news", async (req, res) => {
  try {
    const storyData = req.body;
    const newStory = await News.create(storyData);
    res.status(201).json({
      success: true,
      message: "Story created successfully",
      data: newStory
    });
  } catch (error) {
    console.error("Error creating story:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create story",
      error: error.message
    });
  }
});

app.put("/api/admin/news/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const updatedStory = await News.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!updatedStory) {
      return res.status(404).json({
        success: false,
        message: "Story not found"
      });
    }
    
    res.json({
      success: true,
      message: "Story updated successfully",
      data: updatedStory
    });
  } catch (error) {
    console.error("Error updating story:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update story",
      error: error.message
    });
  }
});

app.delete("/api/admin/news/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedStory = await News.findByIdAndDelete(id);
    
    if (!deletedStory) {
      return res.status(404).json({
        success: false,
        message: "Story not found"
      });
    }
    
    res.json({
      success: true,
      message: "Story deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting story:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete story",
      error: error.message
    });
  }
});

/* =========================================================
   AUTH ROUTES
========================================================= */
// Admin login endpoint
app.post("/api/auth/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // For demo purposes, hardcoded admin credentials
    // In production, use database and proper authentication
    const ADMIN_USERNAME = "admin";
    const ADMIN_PASSWORD = "climate2024";
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const token = jwt.sign(
        { username, role: "admin" },
        process.env.JWT_SECRET || "climate-africa-secret-2024",
        { expiresIn: "24h" }
      );
      
      return res.json({
        success: true,
        message: "Login successful",
        token,
        user: {
          username: ADMIN_USERNAME,
          role: "admin"
        }
      });
    }
    
    // Check database for other users
    if (mongoose.connection.readyState === 1) {
      const user = await User.findOne({ username });
      if (user) {
        const match = await bcrypt.compare(password, user.password);
        if (match) {
          const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            process.env.JWT_SECRET || "climate-africa-secret-2024",
            { expiresIn: "24h" }
          );
          
          return res.json({
            success: true,
            message: "Login successful",
            token,
            user: {
              id: user._id,
              username: user.username,
              email: user.email,
              role: user.role
            }
          });
        }
      }
    }
    
    res.status(401).json({
      success: false,
      message: "Invalid credentials"
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false,
      message: "Login failed" 
    });
  }
});

// Verify token endpoint
app.get("/api/auth/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided"
      });
    }
    
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "climate-africa-secret-2024"
    );
    
    res.json({
      success: true,
      user: decoded
    });
    
  } catch (err) {
    console.error("Token verification error:", err);
    res.status(401).json({
      success: false,
      message: "Invalid token"
    });
  }
});

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
   HEALTH CHECK ENDPOINT
========================================================= */
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cors: {
      enabled: true,
      allowedOrigins: allowedOrigins
    }
  });
});

/* =========================================================
   404 + ERROR HANDLING
========================================================= */
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: "Route not found",
    requestedUrl: req.url,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("🔥 Global error handler:", err);
  
  // Handle CORS errors
  if (err.message && err.message.includes("CORS")) {
    return res.status(403).json({
      success: false,
      message: "CORS error: " + err.message,
      allowedOrigins: allowedOrigins
    });
  }
  
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
});

/* =========================================================
   START SERVER (LOCAL ONLY)
========================================================= */
const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🌍 Allowed origins: ${allowedOrigins.join(', ')}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;