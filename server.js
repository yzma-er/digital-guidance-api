// ✅ server.js

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const authRoutes = require("./routes/auth");
const serviceRoutes = require("./routes/services");
const adminRoutes = require("./routes/admin");
const feedbackRoutes = require("./routes/feedback");
const carouselRoutes = require("./routes/carousel");
const pool = require("./db");

const cloudinary = require("cloudinary").v2;

// ===============================
// ✅ Load variables + Configure Cloudinary FIRST
// ===============================
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();

// ===============================
// ✅ CORS
// ===============================
app.use(cors({
  origin: [
    "https://my-app-seven-sage-61.vercel.app",
    "https://digital-guidance-api.onrender.com"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

// ===============================
// ✅ Create Upload Folders (videos/forms only)
// ===============================
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

ensureDir("videos");
ensureDir("forms");

// ===============================
// ✅ Multer Local Video Upload
// ===============================
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "videos/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const uploadVideo = multer({
  storage: videoStorage,
  fileFilter: (req, file, cb) => {
    const allowed = /mp4|mov|avi|mkv/;
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error("❌ Only video files allowed"));
  },
});

// ===============================
// ✅ Multer for Forms
// ===============================
const formStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "forms/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const uploadForm = multer({
  storage: formStorage,
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|doc|docx/;
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error("❌ Only PDF/DOC/DOCX allowed"));
  },
});

// ===============================
// ❌ REMOVED (No longer needed)
// app.use("/carousel_images", express.static("carousel_images"));
// ===============================

// ===============================
// ✅ Routes
// ===============================
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/carousel", carouselRoutes);

// ===============================
// ✅ Video Upload
// ===============================
app.post("/api/services/upload", uploadVideo.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No video uploaded" });

  res.json({
    message: "Video uploaded successfully",
    filename: req.file.filename,
  });
});

// ===============================
// ✅ Form Upload
// ===============================
app.post("/api/services/upload/form", (req, res) => {
  uploadForm.single("formFile")(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: "No form uploaded" });

    res.json({
      message: "Form uploaded successfully",
      filename: req.file.filename,
    });
  });
});

// ===============================
// ✅ DB Test
// ===============================
pool.getConnection()
  .then(conn => {
    console.log("MySQL Connected!");
    conn.release();
  })
  .catch(err => console.error("MySQL Connection Error:", err));

// ===============================
// ✅ Start Server
// ===============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`API server running on port ${PORT}`)
);

