const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinary Storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "carousel_images",
    allowed_formats: ["jpg", "jpeg", "png"],
  },
});

const upload = multer({ storage });

// Upload carousel image
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    const imageUrl = req.file.path;

    const [result] = await pool.query(
      "INSERT INTO carousel (image, title, caption) VALUES (?, ?, ?)",
      [imageUrl, req.body.title || null, req.body.caption || null]
    );

    res.json({
      message: "Uploaded successfully",
      id: result.insertId,
      image: imageUrl,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

// Get all carousel images
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM carousel ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// Delete carousel image
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query("SELECT image FROM carousel WHERE id = ?", [
      id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }

    const imageUrl = rows[0].image;
    const parts = imageUrl.split("/");
    const publicIdWithExt = parts[parts.length - 1];
    const publicId = `carousel_images/${publicIdWithExt.split(".")[0]}`;

    await cloudinary.uploader.destroy(publicId);
    await pool.query("DELETE FROM carousel WHERE id = ?", [id]);

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

module.exports = router;
