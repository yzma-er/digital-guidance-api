const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const pool = require("../db");
const fs = require("fs");

// ✅ Ensure upload folder exists
const uploadDir = path.join(__dirname, "../carousel_images");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ✅ Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) return cb(null, true);
    cb("❌ Only image files are allowed!");
  },
});

// ✅ Get all carousel images
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM carousel ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching carousel:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// ✅ Upload a new carousel image
router.post("/upload", upload.single("image"), async (req, res) => {
  const { title, caption } = req.body;
  const image = req.file ? req.file.filename : null;

  if (!image) return res.status(400).json({ message: "No image uploaded" });

  try {
    await pool.query(
      "INSERT INTO carousel (image, title, caption) VALUES (?, ?, ?)",
      [image, title || null, caption || null]
    );
    res.json({ message: "✅ Image uploaded successfully!" });
  } catch (err) {
    console.error("❌ Error uploading image:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// ✅ Delete a carousel image
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [[image]] = await pool.query("SELECT image FROM carousel WHERE id = ?", [id]);
    if (!image) return res.status(404).json({ message: "Image not found" });

    const imagePath = path.join(uploadDir, image.image);
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

    await pool.query("DELETE FROM carousel WHERE id = ?", [id]);
    res.json({ message: "🗑️ Image deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting image:", err);
    res.status(500).json({ message: "Database error" });
  }
});

module.exports = router;
