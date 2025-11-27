// routes/admin.js
const express = require("express");
const pool = require("../db");
const { verifyToken, verifyAdmin } = require("../middleware/auth");
const bcrypt = require("bcryptjs");

const router = express.Router();

// ✅ All admin routes require login & admin role
router.use(verifyToken, verifyAdmin);

/* ======================
   SERVICES MANAGEMENT
====================== */

// ✅ Get all services
router.get("/services", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM services");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch services" });
  }
});

// ✅ Add a new service
router.post("/services", async (req, res) => {
  const { name } = req.body;
  try {
    await pool.query("INSERT INTO services (name) VALUES (?)", [name]);
    res.json({ message: "Service added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to add service" });
  }
});

// ✅ Delete a service
router.delete("/services/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM services WHERE service_id = ?", [id]);
    res.json({ success: true, message: "Service deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting service:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// ✅ Update a service
router.put("/services/:id", async (req, res) => {
  const { id } = req.params;
  const { name, description, content } = req.body;

  try {
    await pool.query(
      "UPDATE services SET name = ?, description = ?, content = ? WHERE service_id = ?",
      [name, description, content, id]
    );
    res.json({ message: "Service updated successfully" });
  } catch (err) {
    console.error("❌ Error updating service:", err);
    res.status(500).json({ message: "Failed to update service" });
  }
});






/* ======================
   USERS MANAGEMENT
====================== */

// ✅ GET all users
router.get("/users", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT user_id, email, role, created_at FROM users"
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching users:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Delete a user
router.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM users WHERE user_id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ✅ Update user role
router.put("/users/:id/role", async (req, res) => {
  const { id } = req.params;
  const { role } = req.body; // expected: "admin" or "user"

  try {
    await pool.query("UPDATE users SET role = ? WHERE user_id = ?", [role, id]);
    res.json({ message: "User role updated successfully" });
  } catch (err) {
    console.error("❌ Error updating role:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// ✅ Change a user's password
router.put("/users/:id/password", async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ message: "Password is required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password = ? WHERE user_id = ?", [
      hashedPassword,
      id,
    ]);

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("❌ Error updating password:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// ✅ CREATE ADMIN ACCOUNT (ADD THIS ROUTE)
router.post("/create-admin", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }
    
    // Hash password and create admin user
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
      [email, hashedPassword, 'admin']
    );
    
    res.json({ message: 'Admin account created successfully' });
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    res.status(500).json({ message: 'Failed to create admin account' });
  }
});

// ✅ FEEDBACK MANAGEMENT
router.get("/feedback", async (req, res) => {
  try {
    // Fetch feedback entries with service name + step number
    const [feedbackRows] = await pool.query(`
      SELECT 
        f.feedback_id,
        s.name AS service_name,
        f.step_number,
        f.rating,
        IFNULL(f.comment, 'No comment') AS comment,
        f.created_at
      FROM feedback f
      LEFT JOIN services s ON f.service_id = s.service_id
      ORDER BY f.created_at DESC
    `);

    // Fetch average rating summary per service
    const [summaryRows] = await pool.query(`
      SELECT 
        s.name AS service_name,
        ROUND(AVG(f.rating), 1) AS avg_rating,
        COUNT(f.feedback_id) AS total_feedbacks
      FROM services s
      LEFT JOIN feedback f ON s.service_id = f.service_id
      GROUP BY s.service_id
    `);

    res.json({
      feedback: feedbackRows,
      summary: summaryRows
    });
  } catch (err) {
    console.error("❌ Error fetching feedback:", err);
    res.status(500).json({ message: "Failed to fetch feedback" });
  }
});

// ✅ Delete feedback
router.delete("/feedback/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM feedback WHERE feedback_id = ?", [id]);
    res.json({ success: true, message: "Feedback deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting feedback:", err);
    res.status(500).json({ message: "Database error" });
  }
});



module.exports = router;
