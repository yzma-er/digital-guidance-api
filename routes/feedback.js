// src/routes/feedback.js
const express = require("express");
const router = express.Router();
const pool = require("../db");

// Submit feedback (POST /api/feedback)
router.post("/", async (req, res) => {
  const { service_id, service_name, step_number, rating, comment } = req.body;

  if (!service_id || !rating) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    let finalServiceName = service_name;

    if (!finalServiceName) {
      const [rows] = await pool.query(
        "SELECT name FROM services WHERE service_id = ?",
        [service_id]
      );
      if (rows.length > 0) {
        finalServiceName = rows[0].name;
      } else {
        return res.status(404).json({ message: "Service not found" });
      }
    }

    await pool.query(
      "INSERT INTO feedback (service_id, service_name, step_number, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
      [service_id, finalServiceName, step_number || null, rating, comment || null]
    );

    res.json({ message: "Feedback saved successfully!" });
  } catch (err) {
    console.error("Error saving feedback:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// Fetch all feedback (GET /api/feedback)
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT feedback_id, service_id, service_name, step_number, rating, comment, created_at FROM feedback ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching feedback:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// Delete (DELETE /api/feedback/:id)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM feedback WHERE feedback_id = ?", [id]);
    res.json({ message: "Feedback deleted successfully!" });
  } catch (err) {
    console.error("Error deleting feedback:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// Step ratings per service (GET /api/feedback/step-ratings/:serviceId)
router.get("/step-ratings/:serviceName", async (req, res) => {
  const { serviceName } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT step_number,
              ROUND(AVG(rating), 1) AS avg_rating,
              COUNT(*) AS count
       FROM feedback
       WHERE TRIM(LOWER(service_name)) = TRIM(LOWER(?))
       GROUP BY step_number
       ORDER BY step_number ASC`,
      [serviceName]
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching step ratings:", err);
    res.status(500).json({ message: "Database error" });
  }
});


module.exports = router;
