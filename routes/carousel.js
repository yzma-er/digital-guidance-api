const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

// ========================
//  Cloudinary Configuration
// ========================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ========================
//  Cloudinary Storage Setup
// ========================
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "carousel_images", // Cloudinary folder
    allowed_formats: ["jpg", "jpeg", "png"],
  },
});

const upload = multer({ storage });

// ========================
//  Upload Carousel Image
// ========================
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    const imageUrl = req.file.path; // Cloudinary URL

    const [result] = await pool.query(
      "INSERT INTO carousel (image, title, caption) VALUES (?, ?, ?)",
      [imageUrl, req.body.title || null, req.body.caption || null]
    );

    res.json({
      message: "Carousel image uploaded successfully!",
      id: result.insertId,
      image: imageUrl,
    });
  } catch (err) {
    console.error("❌ Error uploading image:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

// ========================
//  Get All Carousel Images
// ========================
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM carousel ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching carousel images:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// ========================
//  Delete Carousel Image
// ========================
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Get image URL first
    const [rows] = await pool.query(
      "SELECT image FROM carousel WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }

    const imageUrl = rows[0].image;

    // Extract Cloudinary public ID  
    // Example URL: https://res.cloudinary.com/.../carousel_images/xyz123.jpg
    const parts = imageUrl.split("/");
    const publicIdWithExt = parts[parts.length - 1]; // xyz123.jpg
    const publicId = `carousel_images/${publicIdWithExt.split(".")[0]}`;

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    // Delete from database
    await pool.query("DELETE FROM carousel WHERE id = ?", [id]);

    res.json({ message: "Image deleted successfully!" });
  } catch (err) {
    console.error("❌ Error deleting carousel image:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

module.exports = router;
