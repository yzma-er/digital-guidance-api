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
    const { title, caption } = req.body;

    // Get the highest current display_order to put new image at the end
    const [maxOrder] = await pool.query("SELECT COALESCE(MAX(display_order), 0) as max_order FROM carousel");
    const displayOrder = maxOrder[0].max_order + 1;

    const [result] = await pool.query(
      "INSERT INTO carousel (image, title, caption, display_order) VALUES (?, ?, ?, ?)",
      [imageUrl, title || null, caption || null, displayOrder]
    );

    res.json({
      message: "Uploaded successfully",
      id: result.insertId,
      image: imageUrl,
      title: title || null,
      caption: caption || null,
      display_order: displayOrder
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

// Get all carousel images
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM carousel ORDER BY display_order ASC, id ASC");
    res.json(rows);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// Delete carousel image
router.delete("/:id", async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;

    const [rows] = await connection.query("SELECT image FROM carousel WHERE id = ?", [id]);

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Image not found" });
    }

    const imageUrl = rows[0].image;
    const parts = imageUrl.split("/");
    const publicIdWithExt = parts[parts.length - 1];
    const publicId = `carousel_images/${publicIdWithExt.split(".")[0]}`;

    await cloudinary.uploader.destroy(publicId);
    await connection.query("DELETE FROM carousel WHERE id = ?", [id]);
    
    await connection.commit();
    res.json({ message: "Deleted successfully" });
    
  } catch (err) {
    await connection.rollback();
    console.error("Delete error:", err);
    res.status(500).json({ message: "Delete failed" });
  } finally {
    connection.release();
  }
});

// Update display_order for multiple images
router.put('/reorder', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { images } = req.body;
    console.log('Reordering images:', images);
    
    if (!images || !Array.isArray(images)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid images data' });
    }
    
    for (const img of images) {
      console.log(`Updating image ${img.id} to order ${img.display_order}`);
      await connection.query(
        'UPDATE carousel SET display_order = ? WHERE id = ?',
        [img.display_order, img.id]
      );
    }
    
    await connection.commit();
    console.log('Carousel order updated successfully');
    res.json({ message: 'Carousel order updated successfully' });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error updating carousel order:', error);
    res.status(500).json({ 
      message: 'Failed to update carousel order',
      error: error.message 
    });
  } finally {
    connection.release();
  }
});

module.exports = router;
