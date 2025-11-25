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
const pool = require("./db");
const carouselRoutes = require("./routes/carousel")
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");


dotenv.config();
const app = express();

// ===============================
// ✅ CORS Configuration
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
// ✅ Ensure Upload Folders Exist
// ===============================
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created missing folder: ${dir}`);
  }
};
ensureDir("videos");
ensureDir("forms");

// ===============================
// ✅ Multer Video Upload Setup
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
    else cb(new Error("❌ Only video files (mp4, mov, avi, mkv) are allowed"));
  },
});

// ===============================
// ✅ Multer Form Upload Setup (PDF/DOC/DOCX)
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
    else cb(new Error("❌ Only .pdf, .doc, and .docx files are allowed"));
  },
});

// ===============================
// ✅ Serve Static Files
// ===============================
app.use("/videos", express.static(path.join(__dirname, "videos")));
app.use("/forms", express.static(path.join(__dirname, "forms")));
app.use("/carousel_images", express.static("carousel_images"));

// ===============================
// ✅ Routes
// ===============================
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/feedback", feedbackRoutes)
app.use("/api/carousel", carouselRoutes);


// ===============================
// ✅ Video Upload Endpoint
// ===============================
app.post("/api/services/upload", uploadVideo.single("video"), (req, res) => {
  if (!req.file) {
    console.error("❌ No video file received");
    return res.status(400).json({ message: "No video uploaded" });
  }
  res.json({
    message: "✅ Video uploaded successfully!",
    filename: req.file.filename,
  });
});

// ===============================
// ✅ Form Upload Endpoint
// ===============================
app.post("/api/services/upload/form", (req, res) => {
  uploadForm.single("formFile")(req, res, (err) => {
    if (err) {
      console.error("❌ Upload error:", err.message);
      return res.status(400).json({ message: err.message });
    }
    if (!req.file) {
      console.error("❌ No form file received");
      return res.status(400).json({ message: "No form uploaded" });
    }

    res.json({
      message: "✅ Form uploaded successfully!",
      filename: req.file.filename,
    });
  });
});

// ===============================
// ✅ Test Database Connection
// ===============================
pool
  .getConnection()
  .then((conn) => {
    console.log("✅ MySQL connected successfully!");
    conn.release();
  })
  .catch((err) => {
    console.error("❌ MySQL connection failed:", err);
  });

// ===============================
// ✅ Start Server
// ===============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ API server running on http://192.168.1.7:${PORT}`);
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
