// ===============================
//  server.js (FIXED CLOUDINARY FORM UPLOAD)
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
//  Cloudinary Storage for Forms (FIXED - SIMPLIFIED)
// ===============================
const formCloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "forms",
    resource_type: "raw", // Use "raw" for documents instead of "auto"
    // Remove allowed_formats to let Cloudinary handle all document types
  },
});

// ===============================
//  Multer Upload Instances
// ===============================
const uploadFormToCloudinary = multer({ 
  storage: formCloudinaryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for forms
  fileFilter: (req, file, cb) => {
    // Simple file extension check
    const fileExt = path.extname(file.originalname).toLowerCase();
    const allowedExt = ['.pdf', '.doc', '.docx'];
    
    if (allowedExt.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, and DOCX files are allowed.'));
    }
  }
});

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
      filename: req.file.filename,
      url: req.file.path
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
      filename: req.file.filename,
      url: req.file.path
    });
  } catch (error) {
    console.error("❌ Cloudinary step video upload error:", error);
    res.status(500).json({ message: "Failed to upload step video to Cloudinary" });
  }
});

// ===============================
//  Form Upload to Cloudinary (FIXED)
// ===============================
app.post("/api/services/upload/form", uploadFormToCloudinary.single("formFile"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No form file uploaded" });
    }

    console.log("✅ Form upload successful:", {
      originalname: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size
    });

    res.json({
      message: "Form uploaded to Cloudinary successfully",
      filename: req.file.filename,
      url: req.file.path,
      originalName: req.file.originalname
    });
  } catch (error) {
    console.error("❌ Form upload error:", error);
    res.status(500).json({ 
      message: "Failed to upload form to Cloudinary",
      error: error.message 
    });
  }
});

// ===============================
//  Error handling middleware
// ===============================
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large' });
    }
  }
  console.error("❌ Server error:", error);
  res.status(500).json({ message: 'Something went wrong!' });
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
