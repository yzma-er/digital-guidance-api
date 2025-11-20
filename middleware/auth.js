// middleware/auth.js
const jwt = require("jsonwebtoken");

// ✅ Verify token exists and decode it
function verifyToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // attach user info (id, role, etc.)
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

// ✅ Check admin role
function verifyAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admins only" });
  }
  next();
}

module.exports = { verifyToken, verifyAdmin };
