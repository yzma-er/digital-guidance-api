// ===============================
//  server.js (UPDATED WITH CLOUDINARY PATTERN)
// ===============================

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
const { CloudinaryStorage } = require("multer-storage-cloudinary");

// ===============================
//  Load .env + Configure Cloudinary
// ===============================
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ===============================
//  Express App
// ===============================
const app = express();

// ===============================
//  CORS
// ===============================
app.use(
  cors({
    origin: [
      "https://my-app-seven-sage-61.vercel.app",
      "https://digital-guidance-api.onrender.com",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());

// ===============================
//  Ensure Forms Folder exists
// ===============================
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};
ensureDir("forms");

// ===============================
//  Serve Form Files (forms stay local)
// ===============================
app.use("/forms", express.static(path.join(__dirname, "forms")));

// ===============================
//  Cloudinary Storage for Videos (MAIN VIDEOS)
// ===============================
const mainVideoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "main_videos",
    resource_type: "video",
    allowed_formats: ["mp4", "mov", "avi", "mkv"],
    chunk_size: 6000000, // 6MB chunks
  },
});

// ===============================
//  Cloudinary Storage for Videos (STEP VIDEOS)
// ===============================
const stepVideoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "step_videos",
    resource_type: "video",
    allowed_formats: ["mp4", "mov", "avi", "mkv"],
    chunk_size: 6000000,
  },
});

// ===============================
//  Multer for Forms (keep local)
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
//  Multer Upload Instances
// ===============================
const uploadMainVideo = multer({ storage: mainVideoStorage });
const uploadStepVideo = multer({ storage: stepVideoStorage });

// ===============================
//  API Routes
// ===============================
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/carousel", carouselRoutes);

// ===============================
//  Main Video Upload to Cloudinary
// ===============================
app.post("/api/services/upload", uploadMainVideo.single("video"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No video uploaded" });

    res.json({
      message: "Main video uploaded to Cloudinary successfully",
      filename: req.file.filename, // Cloudinary public_id
      url: req.file.path // Cloudinary secure_url
    });
  } catch (error) {
    console.error("❌ Cloudinary upload error:", error);
    res.status(500).json({ message: "Failed to upload video to Cloudinary" });
  }
});

// ===============================
//  Step Video Upload to Cloudinary
// ===============================
app.post("/api/services/upload/step-video", uploadStepVideo.single("video"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No step video uploaded" });

    res.json({
      message: "Step video uploaded to Cloudinary successfully",
      filename: req.file.filename, // Cloudinary public_id
      url: req.file.path // Cloudinary secure_url
    });
  } catch (error) {
    console.error("❌ Cloudinary step video upload error:", error);
    res.status(500).json({ message: "Failed to upload step video to Cloudinary" });
  }
});

// ===============================
//  Form Upload (keep local)
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
//  Test MySQL Connection
// ===============================
pool
  .getConnection()
  .then((conn) => {
    console.log("MySQL Connected!");
    conn.release();
  })
  .catch((err) => console.error("MySQL Connection Error:", err));

// ===============================
//  Start Server
// ===============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`API server running on port ${PORT}`)
);
