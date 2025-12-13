// src/routes/feedback.js
const express = require("express");
const router = express.Router();
const pool = require("../db");

// Check if user has already rated a specific step (GET /api/feedback/check)
router.get("/check", async (req, res) => {
  const { user_id, service_id, step_number } = req.query;
  
  if (!user_id || !service_id || !step_number) {
    return res.status(400).json({ 
      success: false, 
      message: "Missing required parameters: user_id, service_id, step_number" 
    });
  }
  
  try {
    const [rows] = await pool.query(
      'SELECT * FROM feedback WHERE user_id = ? AND service_id = ? AND step_number = ?',
      [user_id, service_id, step_number]
    );
    
    if (rows.length > 0) {
      res.json({
        success: true,
        exists: true,
        feedback: rows[0]
      });
    } else {
      res.json({
        success: true,
        exists: false,
        feedback: null
      });
    }
  } catch (error) {
    console.error('Error checking feedback:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking feedback' 
    });
  }
});

// Submit or update feedback (POST /api/feedback)
router.post("/", async (req, res) => {
  const { service_id, service_name, step_number, rating, comment, user_id } = req.body;

  if (!service_id || !rating || !user_id) {
    return res.status(400).json({ 
      success: false,
      message: "Missing required fields: service_id, rating, and user_id are required" 
    });
  }

  try {
    let finalServiceName = service_name;

    // Get service name if not provided
    if (!finalServiceName) {
      const [rows] = await pool.query(
        "SELECT name FROM services WHERE service_id = ?",
        [service_id]
      );
      if (rows.length > 0) {
        finalServiceName = rows[0].name;
      } else {
        return res.status(404).json({ 
          success: false,
          message: "Service not found" 
        });
      }
    }

    // Get user email from users table
    let user_email = null;
    const [userRows] = await pool.query('SELECT email FROM users WHERE user_id = ?', [user_id]);
    if (userRows.length > 0) {
      user_email = userRows[0].email;
    }

    // Check if feedback already exists for this user, service, and step
    const [existing] = await pool.query(
      'SELECT * FROM feedback WHERE user_id = ? AND service_id = ? AND step_number = ?',
      [user_id, service_id, step_number || 0]
    );

    let result;
    let isUpdate = false;

    if (existing.length > 0) {
      // Update existing feedback
      await pool.query(
        `UPDATE feedback 
         SET rating = ?, comment = ?, user_email = ?, updated_at = NOW() 
         WHERE feedback_id = ?`,
        [rating, comment || null, user_email, existing[0].feedback_id]
      );
      
      result = { feedback_id: existing[0].feedback_id };
      isUpdate = true;
    } else {
      // Create new feedback
      const [insertResult] = await pool.query(
        `INSERT INTO feedback 
         (service_id, service_name, step_number, rating, comment, user_id, user_email, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [service_id, finalServiceName, step_number || 0, rating, comment || null, user_id, user_email]
      );
      
      result = { feedback_id: insertResult.insertId };
      isUpdate = false;
    }

    res.json({ 
      success: true,
      message: isUpdate ? "Feedback updated successfully!" : "Feedback submitted successfully!",
      updated: isUpdate,
      ...result
    });
  } catch (err) {
    console.error("Error saving feedback:", err);
    res.status(500).json({ 
      success: false,
      message: "Database error" 
    });
  }
});

// Update existing feedback (PUT /api/feedback/:id)
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;
  
  if (!rating) {
    return res.status(400).json({ 
      success: false, 
      message: "Rating is required" 
    });
  }
  
  try {
    await pool.query(
      `UPDATE feedback 
       SET rating = ?, comment = ?, updated_at = NOW() 
       WHERE feedback_id = ?`,
      [rating, comment || null, id]
    );
    
    res.json({ 
      success: true, 
      message: 'Feedback updated successfully',
      updated: true 
    });
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating feedback' 
    });
  }
});

// Get feedback for a specific service (GET /api/feedback/service/:serviceId)
router.get("/service/:serviceId", async (req, res) => {
  const { serviceId } = req.params;
  
  try {
    const [rows] = await pool.query(
      `SELECT feedback_id, service_id, service_name, step_number, rating, comment, 
              user_id, user_email, created_at, updated_at
       FROM feedback 
       WHERE service_id = ? 
       ORDER BY step_number ASC, created_at DESC`,
      [serviceId]
    );
    
    res.json(rows);
  } catch (err) {
    console.error("Error fetching service feedback:", err);
    res.status(500).json({ 
      success: false,
      message: "Database error" 
    });
  }
});

// Fetch all feedback (GET /api/feedback)
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT feedback_id, service_id, service_name, step_number, rating, comment, 
              user_id, user_email, created_at, updated_at 
       FROM feedback 
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching feedback:", err);
    res.status(500).json({ 
      success: false,
      message: "Database error" 
    });
  }
});

// Delete feedback (DELETE /api/feedback/:id)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM feedback WHERE feedback_id = ?", [id]);
    res.json({ 
      success: true,
      message: "Feedback deleted successfully!" 
    });
  } catch (err) {
    console.error("Error deleting feedback:", err);
    res.status(500).json({ 
      success: false,
      message: "Database error" 
    });
  }
});

// Step ratings per service (GET /api/feedback/step-ratings/:serviceName)
router.get("/step-ratings/:serviceName", async (req, res) => {
  const serviceName = decodeURIComponent(req.params.serviceName);

  try {
    const [rows] = await pool.query(
      `SELECT step_number,
              ROUND(AVG(rating), 1) AS avg_rating,
              COUNT(*) AS count
       FROM feedback
       WHERE service_name = ?
       GROUP BY step_number
       ORDER BY step_number ASC`,
      [serviceName]
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching step ratings:", err);
    res.status(500).json({ 
      success: false,
      message: "Database error" 
    });
  }
});

module.exports = router;
