const express = require("express");
const pool = require("../db");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ============ Multer config ============
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "videos/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

/* ======================
   PUBLIC ROUTES
====================== */

// ✅ Get all services
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT service_id, name, description, description2, video FROM services ORDER BY name ASC"

    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching services:", err);
    res.status(500).json({ message: "Failed to fetch services" });
  }
});

// ✅ Get a specific service by ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query("SELECT * FROM services WHERE service_id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ message: "Service not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Error fetching service:", err);
    res.status(500).json({ message: "Failed to fetch service" });
  }
});

/* ======================
   ADMIN ROUTES
====================== */

// ✅ Add new service
router.post("/", async (req, res) => {
  const { name, description, description2, video, content } = req.body;
  if (!name) return res.status(400).json({ message: "Service name is required" });

  try {
    await pool.query(
      "INSERT INTO services (name, description, description2, video, content) VALUES (?, ?, ?, ?, ?)",
      [name, description || "", description2 || "", video || "", content || ""]
    );
    res.json({ message: "✅ Service added successfully" });
  } catch (err) {
    console.error("❌ Error adding service:", err);
    res.status(500).json({ message: "Failed to add service" });
  }
});


// ✅ Update existing service (UPDATED FOR CLOUDINARY)

router.put("/:id", async (req, res) => {  // Remove upload.single("video") since we're not using local upload
  const { id } = req.params;
  const { name, description, description2, content } = req.body;

  try {
    // Get old service data
    const [rows] = await pool.query("SELECT video FROM services WHERE service_id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ message: "Service not found" });

    // Ensure JSON string for content
    const contentString = typeof content === 'string' ? content : JSON.stringify(content || []);

    // 🟢 Update query
    const [result] = await pool.query(
      "UPDATE services SET name = ?, description = ?, description2 = ?, content = ? WHERE service_id = ?",
      [name, description, description2, contentString, id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Service not found" });

    res.json({ message: "✅ Service updated successfully" });
  } catch (err) {
    console.error("❌ Error updating service:", err);
    res.status(500).json({ message: "Failed to update service" });
  }
});

// ✅ Upload video
router.post("/video", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No video uploaded" });
  res.json({ filename: req.file.filename });
});

// ✅ Delete service
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query("DELETE FROM services WHERE service_id = ?", [id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Service not found" });
    res.json({ message: "🗑️ Service deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting service:", err);
    res.status(500).json({ message: "Failed to delete service" });
  }
});

// ✅ Submit feedback
router.post("/feedback", async (req, res) => {
  const { service_id, rating, comment } = req.body;

  if (!service_id || !rating) {
    return res.status(400).json({ message: "Service ID and rating are required." });
  }

  try {
    await pool.query(
      "INSERT INTO feedback (service_id, rating, comment) VALUES (?, ?, ?)",
      [service_id, rating, comment || null]
    );
    res.json({ message: "✅ Feedback submitted successfully!" });
  } catch (err) {
    console.error("❌ Error submitting feedback:", err);
    res.status(500).json({ message: "Failed to submit feedback." });
  }
});


module.exports = router;
