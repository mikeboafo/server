const mongoose = require("mongoose");

const newsSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String, required: true },
    category: { type: String, required: true },
    categorySlug: { type: String, required: true },
    publishedAt: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.News || mongoose.model("News", newsSchema);
