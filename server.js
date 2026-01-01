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

// Add cache-control middleware for API routes
app.use((req, res, next) => {
  // Only add cache headers for API routes
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
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
          publishedAt: new Date()
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

// FIXED CATEGORY ROUTE WITH CACHE CONTROL AND BETTER DEBUGGING
app.get("/api/news/category/:slug", async (req, res) => {
  const slug = req.params.slug;
  console.log(`🚀 Category endpoint called: ${slug} at ${new Date().toISOString()}`);
  
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
      
      // Return successful response
      console.log(`🎯 Returning ${news.length} documents for category: ${slug}`);
      return res.json({
        success: true,
        data: news,
        count: news.length,
        category: slug
      });
      
    } else {
      console.log("❌ Database not connected");
      return res.json({
        success: false,
        data: [],
        message: "Database not connected",
        dbState: mongoose.connection.readyState
      });
    }
    
  } catch (err) {
    console.error("🔥 Category route error:", err);
    return res.json({
      success: false,
      data: [],
      message: "Server error",
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