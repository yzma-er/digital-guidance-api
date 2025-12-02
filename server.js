// ===============================
//  server.js (FIXED - COMPLETE VERSION)
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
  },
});

// ===============================
//  Multer Upload Instances for Videos
// ===============================
const uploadMainVideo = multer({ 
  storage: mainVideoStorage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

const uploadStepVideo = multer({ 
  storage: stepVideoStorage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

// ===============================
//  SIMPLE Multer for Forms (Memory Storage)
// ===============================
const uploadForm = multer({
  storage: multer.memoryStorage(), // Store in memory first
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedExt = ['.pdf', '.doc', '.docx'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
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
//  Form Upload to Cloudinary (FIXED - SIMPLE APPROACH)
// ===============================
app.post("/api/services/upload/form", uploadForm.single("formFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No form file uploaded" });
    }

    console.log("📤 Uploading form to Cloudinary:", {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // Convert buffer to base64 for Cloudinary
    const fileBuffer = req.file.buffer;
    const fileBase64 = `data:${req.file.mimetype};base64,${fileBuffer.toString('base64')}`;

    // Upload to Cloudinary with explicit raw resource type
    const result = await cloudinary.uploader.upload(fileBase64, {
      folder: "forms",
      resource_type: "raw", // ✅ FIXED: Use "raw" for documents
      public_id: `form_${Date.now()}_${path.parse(req.file.originalname).name}`,
      // Remove any format restrictions
    });

    console.log("✅ Cloudinary upload successful:", result.secure_url);

    res.json({
      message: "Form uploaded successfully",
      filename: result.public_id,
      url: result.secure_url,
      originalName: req.file.originalname
    });
  } catch (error) {
    console.error("❌ Cloudinary upload error:", error);
    res.status(500).json({ 
      message: "Failed to upload form",
      error: error.message 
    });
  }
});


// ===============================
//  Cloudinary Storage for Photos
// ===============================
const photoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "service-photos",
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
  },
});

const uploadPhoto = multer({ 
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ===============================
//  Photo Upload Endpoint
// ===============================
app.post("/api/services/upload/photo", uploadPhoto.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    res.json({
      message: "Photo uploaded to Cloudinary successfully",
      url: req.file.path,
      public_id: req.file.filename
    });
  } catch (error) {
    console.error("❌ Cloudinary photo upload error:", error);
    res.status(500).json({ message: "Failed to upload photo to Cloudinary" });
  }
});

// ===============================
//  Test Cloudinary Connection
// ===============================
app.get("/api/test-cloudinary", async (req, res) => {
  try {
    const result = await cloudinary.api.ping();
    console.log("✅ Cloudinary test successful");
    res.json({ 
      message: "Cloudinary is working",
      status: result 
    });
  } catch (error) {
    console.error("❌ Cloudinary test failed:", error);
    res.status(500).json({ 
      message: "Cloudinary configuration error",
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
