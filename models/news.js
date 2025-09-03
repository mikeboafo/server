const mongoose = require("mongoose");

const newsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String },
  description: { type: String },
  image: { type: String, required: true },
  category: { type: String, required: true },
  categorySlug: { type: String },
  publishedAt: { type: Date, default: Date.now },
}, { timestamps: true });

newsSchema.virtual("body").get(function () {
  return this.content || this.description;
});

module.exports = mongoose.models.News || mongoose.model("News", newsSchema);
