// ===============================
//  server.js (UPDATED FOR CLOUDINARY)
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
//  Ensure Upload Folders exist (for forms only now)
// ===============================
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

ensureDir("forms"); // Only forms need local storage now

// ===============================
//  Serve Form Files only (videos go to Cloudinary)
// ===============================
app.use("/forms", express.static(path.join(__dirname, "forms")));

// ===============================
//  Multer Storage for Forms (keep local for forms)
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
//  Multer Memory Storage for Videos (for Cloudinary)
// ===============================
const memoryStorage = multer.memoryStorage();
const uploadVideo = multer({ 
  storage: memoryStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowed = /mp4|mov|avi|mkv/;
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error("❌ Only video files allowed"));
  },
});

// ===============================
//  Cloudinary Upload Function
// ===============================
const uploadToCloudinary = (fileBuffer, folder = "videos") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        folder: folder,
        chunk_size: 6000000, // 6MB chunks
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

// ===============================
//  API Routes
// ===============================
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/carousel", carouselRoutes);

// ===============================
//  Main Video Upload to Cloudinary (UPDATED)
// ===============================
app.post("/api/services/upload", uploadVideo.single("video"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No video uploaded" });

    const result = await uploadToCloudinary(req.file.buffer, "main-videos");
    
    res.json({
      message: "Video uploaded to Cloudinary successfully",
      filename: result.public_id,
      url: result.secure_url
    });
  } catch (error) {
    console.error("❌ Cloudinary upload error:", error);
    res.status(500).json({ message: "Failed to upload video to Cloudinary" });
  }
});

// ===============================
//  Step Video Upload to Cloudinary (NEW)
// ===============================
app.post("/api/services/upload/step-video", uploadVideo.single("video"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No step video uploaded" });

    const result = await uploadToCloudinary(req.file.buffer, "step-videos");
    
    res.json({
      message: "Step video uploaded to Cloudinary successfully",
      filename: result.public_id,
      url: result.secure_url
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
