// ===============================
//  server.js (UPDATED WITH CLOUDINARY FOR FORMS)
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
//  Cloudinary Storage for Forms (NEW)
// ===============================
const formStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "forms",
    resource_type: "auto",
    allowed_formats: ["pdf", "doc", "docx"],
    // You can add transformation parameters if needed
    // transformation: [{ width: 500, height: 500, crop: 'limit' }]
  },
});

// ===============================
//  Multer Upload Instances
// ===============================
const uploadMainVideo = multer({ storage: mainVideoStorage });
const uploadStepVideo = multer({ storage: stepVideoStorage });
const uploadForm = multer({ 
  storage: formStorage,
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|doc|docx/;
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error("❌ Only PDF/DOC/DOCX allowed"));
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for forms
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
//  Form Upload to Cloudinary (WITH BETTER ERROR HANDLING)
// ===============================
app.post("/api/services/upload/form", uploadForm.single("formFile"), (req, res) => {
  try {
    console.log("📁 Form upload request received");
    console.log("📦 Request file:", req.file);
    console.log("🔑 Cloudinary config:", {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? "Set" : "Missing",
      api_key: process.env.CLOUDINARY_API_KEY ? "Set" : "Missing",
    });

    if (!req.file) {
      console.log("❌ No file in request");
      return res.status(400).json({ message: "No form uploaded" });
    }

    // Check if Cloudinary upload was successful
    if (!req.file.path) {
      console.log("❌ Cloudinary upload failed - no path returned");
      return res.status(500).json({ message: "Cloudinary upload failed" });
    }

    console.log("✅ Form uploaded successfully to:", req.file.path);
    
    res.json({
      message: "Form uploaded to Cloudinary successfully",
      filename: req.file.filename, // Cloudinary public_id
      url: req.file.path, // Cloudinary secure_url
      public_id: req.file.filename
    });
  } catch (error) {
    console.error("❌ Cloudinary form upload error:", error);
    console.error("❌ Error details:", error.message);
    console.error("❌ Error stack:", error.stack);
    res.status(500).json({ 
      message: "Failed to upload form to Cloudinary",
      error: error.message 
    });
  }
});

// ===============================
//  Delete Form from Cloudinary (OPTIONAL - for cleanup)
// ===============================
app.delete("/api/services/upload/form/:public_id", async (req, res) => {
  try {
    const { public_id } = req.params;
    
    const result = await cloudinary.uploader.destroy(public_id, {
      resource_type: 'raw' // Use 'raw' for documents
    });
    
    if (result.result === 'ok') {
      res.json({ message: "Form deleted successfully from Cloudinary" });
    } else {
      res.status(404).json({ message: "Form not found in Cloudinary" });
    }
  } catch (error) {
    console.error("❌ Cloudinary form deletion error:", error);
    res.status(500).json({ message: "Failed to delete form from Cloudinary" });
  }
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
