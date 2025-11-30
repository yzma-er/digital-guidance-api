// middleware/auth.js
const jwt = require("jsonwebtoken");
const pool = require("../db"); // Make sure to import your database connection

// ✅ Verify token exists and decode it + check user exists in database
async function verifyToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    // Verify and decode the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists in database and get current role
    const [users] = await pool.execute(
      'SELECT user_id, email, role FROM users WHERE user_id = ?',
      [decoded.user_id]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    // Attach current user data from database (not just from token)
    req.user = users[0];
    next();
  } catch (err) {
    console.error("Token verification error:", err);
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: "Invalid token" });
    }
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Token expired" });
    }
    
    return res.status(500).json({ message: "Server error during authentication" });
  }
}

// ✅ Check admin role (using current database data, not just token data)
function verifyAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }
  
  next();
}

module.exports = { verifyToken, verifyAdmin };
