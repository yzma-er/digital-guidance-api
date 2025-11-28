// src/routes/feedback.js
const express = require("express");
const router = express.Router();
const pool = require("../db");

// Submit feedback (POST /api/feedback) - UPDATED for replaceable ratings
router.post("/", async (req, res) => {
  const { service_id, service_name, step_number, rating, comment, user_id } = req.body;

  if (!service_id || !rating || !step_number) {
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

    // Check if user already rated this step
    if (user_id) {
      const [existing] = await pool.query(
        "SELECT feedback_id FROM feedback WHERE service_id = ? AND step_number = ? AND user_id = ?",
        [service_id, step_number, user_id]
      );

      if (existing.length > 0) {
        // Update existing rating
        await pool.query(
          "UPDATE feedback SET rating = ?, comment = ?, created_at = NOW() WHERE feedback_id = ?",
          [rating, comment || null, existing[0].feedback_id]
        );
        return res.json({ message: "Feedback updated successfully!", updated: true });
      }
    }

    // Insert new rating
    await pool.query(
      "INSERT INTO feedback (service_id, service_name, step_number, rating, comment, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
      [service_id, finalServiceName, step_number, rating, comment || null, user_id || null]
    );

    res.json({ message: "Feedback saved successfully!", updated: false });
  } catch (err) {
    console.error("Error saving feedback:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// Fetch all feedback with user info (GET /api/feedback) - UPDATED
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.feedback_id, f.service_id, f.service_name, f.step_number, 
              f.rating, f.comment, f.created_at, f.user_id,
              u.email as user_email
       FROM feedback f
       LEFT JOIN users u ON f.user_id = u.user_id
       ORDER BY f.created_at DESC`
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

// Step ratings per service with custom names (GET /api/feedback/step-ratings/:serviceName)
router.get("/step-ratings/:serviceName", async (req, res) => {
  const { serviceName } = req.params;

  try {
    // First, get the service to extract custom step names from content
    const [serviceRows] = await pool.query(
      "SELECT service_id, content FROM services WHERE TRIM(LOWER(name)) = TRIM(LOWER(?))",
      [serviceName]
    );

    if (serviceRows.length === 0) {
      return res.status(404).json({ message: "Service not found" });
    }

    const service = serviceRows[0];
    let customStepNames = {};

    // Parse the content JSON to extract custom names
    try {
      if (service.content) {
        const content = JSON.parse(service.content);
        if (Array.isArray(content)) {
          content.forEach((step, index) => {
            const stepNumber = index + 1;
            if (step.customName) {
              customStepNames[stepNumber] = step.customName;
            }
          });
        }
      }
    } catch (parseError) {
      console.warn("Error parsing service content:", parseError);
    }

    // Get step ratings from feedback
    const [ratingRows] = await pool.query(
      `SELECT step_number,
              ROUND(AVG(rating), 1) AS avg_rating,
              COUNT(*) AS count
       FROM feedback
       WHERE TRIM(LOWER(service_name)) = TRIM(LOWER(?))
       GROUP BY step_number
       ORDER BY step_number ASC`,
      [serviceName]
    );

    // Combine ratings with custom names
    const stepRatingsWithNames = ratingRows.map(row => ({
      step_number: row.step_number,
      avg_rating: row.avg_rating,
      count: row.count,
      custom_name: customStepNames[row.step_number] || null
    }));

    res.json(stepRatingsWithNames);
  } catch (err) {
    console.error("Error fetching step ratings:", err);
    res.status(500).json({ message: "Database error" });
  }
});

module.exports = router;
