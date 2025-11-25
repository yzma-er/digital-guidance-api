const express = require("express");
const router = express.Router();
const pool = require("../db");

const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

// ----------------------------
// ✅ Cloudinary Config
// ----------------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ----------------------------
// ✅ Multer → Cloudinary Storage
// ----------------------------
const carouselStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "carousel_images",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const uploadCarousel = multer({ storage: carouselStorage });

// ----------------------------
// ✅ GET ALL CAROUSEL IMAGES
// ----------------------------
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM carousel ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching carousel:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// ----------------------------
// ✅ UPLOAD IMAGE TO CLOUDINARY
// ----------------------------
router.post("/upload", uploadCarousel.single("image"), async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    const imageUrl = req.file.path;      // Cloudinary URL
    const publicId = req.file.filename;  // Cloudinary public_id

    const [result] = await pool.query(
      "INSERT INTO carousel (image, public_id, title, caption) VALUES (?, ?, ?, ?)",
      [imageUrl, publicId, req.body.title, req.body.caption]
    );

    res.json({
      message: "Uploaded successfully",
      id: result.insertId,
      imageUrl,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: "Upload failed" });
  }
});

// ----------------------------
// ✅ DELETE IMAGE (Cloudinary + DB)
// ----------------------------
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [[row]] = await pool.query("SELECT public_id FROM carousel WHERE id = ?", [id]);

    if (!row) return res.status(404).json({ message: "Image not found" });

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(`carousel_images/${row.public_id}`);

    // Delete from DB
    await pool.query("DELETE FROM carousel WHERE id = ?", [id]);

    res.json({ message: "🗑️ Image deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting image:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

module.exports = router;
