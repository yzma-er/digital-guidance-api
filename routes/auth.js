// routes/auth.js - OTP LOGGING VERSION
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const router = express.Router();

// Keep transporter for health check (but we won't use it for emails)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER || 'dummy@example.com',
    pass: process.env.EMAIL_PASS || 'dummy'
  },
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 5000
});

// Test connection on startup (will fail, but that's OK)
transporter.verify((error, success) => {
  if (error) {
    console.log('ℹ️ Email service: OTP Logging Mode (Gmail blocked on Render)');
  } else {
    console.log('✅ Gmail is ready to send messages');
  }
});

// OTP storage (use Redis in production)
const otpStore = new Map();

// Generate 6-digit OTP
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// SIMPLE OTP LOGGING - NO EMAIL SENDING
async function sendOTPEmail(email, otp) {
  console.log('='.repeat(60));
  console.log('🎯 OTP VERIFICATION CODE');
  console.log('='.repeat(60));
  console.log(`📧 For: ${email}`);
  console.log(`🔐 Code: ${otp}`);
  console.log(`⏰ Expires: ${new Date(Date.now() + 10 * 60 * 1000).toLocaleTimeString()}`);
  console.log('='.repeat(60));
  console.log('💡 User should enter this code in the verification form');
  console.log('='.repeat(60));
  
  // Also store in memory for admin viewing
  const fs = require('fs');
  try {
    fs.appendFileSync('/tmp/otp-log.txt', 
      `[${new Date().toISOString()}] ${email} - ${otp}\n`
    );
  } catch (e) {
    // Ignore file errors
  }
  
  return { 
    success: true, 
    otp: otp,  // Return OTP so we can include it in API response
    mode: 'logging'
  };
}

// Rate limiting
const rateLimits = new Map();

function checkRateLimit(email, type = 'otp') {
  const now = Date.now();
  const key = `${email}:${type}`;
  const limit = rateLimits.get(key) || { count: 0, resetTime: now + 3600000 };
  
  if (now > limit.resetTime) {
    limit.count = 0;
    limit.resetTime = now + 3600000;
  }
  
  // Max 5 OTP requests per hour
  if (limit.count >= 5) {
    return { 
      allowed: false, 
      retryAfter: Math.ceil((limit.resetTime - now) / 1000),
      message: 'Too many OTP requests. Please try again later.'
    };
  }
  
  limit.count++;
  rateLimits.set(key, limit);
  return { allowed: true };
}

// 1. Request OTP - UPDATED TO RETURN OTP IN RESPONSE
router.post('/request-otp', async (req, res) => {
  const { email } = req.body;

  try {
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false,
        message: 'Please enter a valid email address.' 
      });
    }

    // Check rate limit
    const rateLimit = checkRateLimit(email);
    if (!rateLimit.allowed) {
      return res.status(429).json({ 
        success: false,
        message: rateLimit.message,
        retryAfter: rateLimit.retryAfter
      });
    }

    // Check if email already registered
    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: 'This email is already registered. Please log in instead.' 
      });
    }

    // Generate and store OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    otpStore.set(email, {
      otp,
      expiresAt,
      attempts: 0,
      createdAt: Date.now(),
      verified: false
    });

    // "Send" OTP (actually just logs it)
    await sendOTPEmail(email, otp);

    // RETURN OTP IN RESPONSE FOR TESTING
    res.json({ 
      success: true, 
      message: 'Verification code ready. Use the code below.',
      expiresAt: expiresAt,
      otp: otp,  // ⬅️ THIS IS THE KEY CHANGE - OTP IN RESPONSE
      note: 'Email service coming soon. For now, use the code above.'
    });

  } catch (error) {
    console.error('OTP request error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to generate verification code. Please try again.'
    });
  }
});

// 2. Verify OTP - NO CHANGES NEEDED
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    const storedData = otpStore.get(email);

    if (!storedData) {
      return res.status(400).json({ 
        success: false,
        message: 'No verification code found. Please request a new one.' 
      });
    }

    // Check expiration
    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ 
        success: false,
        message: 'Verification code has expired. Please request a new one.' 
      });
    }

    // Check attempts (max 3)
    if (storedData.attempts >= 3) {
      otpStore.delete(email);
      return res.status(400).json({ 
        success: false,
        message: 'Too many failed attempts. Please request a new verification code.' 
      });
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      storedData.attempts += 1;
      otpStore.set(email, storedData);
      
      return res.status(400).json({ 
        success: false,
        message: 'Invalid verification code.',
        attemptsLeft: 3 - storedData.attempts
      });
    }

    // Mark as verified
    storedData.verified = true;
    otpStore.set(email, storedData);

    res.json({ 
      success: true, 
      message: 'Email verified successfully!',
      expiresAt: storedData.expiresAt
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Verification failed. Please try again.' 
    });
  }
});

// 3. Complete signup - NO CHANGES NEEDED
router.post('/signup', async (req, res) => {
  const { email, password, otp } = req.body;

  try {
    // Check if email is verified
    const storedData = otpStore.get(email);
    
    if (!storedData || !storedData.verified) {
      return res.status(400).json({ 
        success: false,
        message: 'Email not verified. Please verify your email first.' 
      });
    }

    // Verify OTP again for security
    if (storedData.otp !== otp) {
      return res.status(400).json({ 
        success: false,
        message: 'Verification code mismatch. Please restart the signup process.' 
      });
    }

    // Check if user already exists
    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      otpStore.delete(email);
      return res.status(400).json({ 
        success: false,
        message: 'User already exists. Please log in instead.' 
      });
    }

    // Validate password
    if (!password || password.length < 8) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 8 characters long.' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const [result] = await pool.query(
      'INSERT INTO users (email, password, role, email_verified) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, 'user', true]
    );

    // Clear OTP from storage
    otpStore.delete(email);

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: result.insertId,
        email: email,
        role: 'user',
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ 
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: result.insertId,
        email,
        role: 'user',
        email_verified: true
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists.' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Server error during signup. Please try again.' 
    });
  }
});

// 4. Resend OTP - UPDATED
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;

  try {
    // Check if OTP already exists and is not expired
    const storedData = otpStore.get(email);
    const now = Date.now();
    
    if (storedData && storedData.expiresAt > now && (now - storedData.createdAt) < 30000) {
      // If last OTP was sent less than 30 seconds ago, prevent resend
      return res.status(429).json({
        success: false,
        message: 'Please wait 30 seconds before requesting a new code.'
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const expiresAt = now + 10 * 60 * 1000;
    
    otpStore.set(email, {
      otp,
      expiresAt,
      attempts: 0,
      createdAt: now,
      verified: false
    });

    // "Send" new OTP
    await sendOTPEmail(email, otp);

    res.json({
      success: true,
      message: 'New verification code ready.',
      expiresAt: expiresAt,
      otp: otp  // ⬅️ Return OTP in response for resend too
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate new verification code.'
    });
  }
});

// Keep existing login endpoint - NO CHANGES
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Optional: Check if email is verified
    if (!user.email_verified) {
      return res.status(403).json({ 
        success: false,
        message: 'Please verify your email before logging in.' 
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      success: true,
      token,
      user: {
        id: user.user_id,
        email: user.email,
        role: user.role,
        email_verified: user.email_verified
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Login failed' 
    });
  }
});

// Test endpoint - UPDATED
router.get('/test-email', async (req, res) => {
  const testEmail = 'test@example.com';
  const otp = '123456';
  
  try {
    const result = await sendOTPEmail(testEmail, otp);
    res.json({ 
      success: true, 
      message: 'OTP logging test successful',
      otp: otp,
      mode: result.mode
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Test failed',
      error: error.message 
    });
  }
});

// Health check endpoint - NO CHANGES
router.get('/health', async (req, res) => {
  try {
    // Check database
    await pool.query('SELECT 1');
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        email: 'logging_mode',  // Changed from disconnected
        otp_store: 'running',
        rate_limiting: 'active'
      },
      note: 'OTP system in logging mode (Render blocks Gmail)'
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// View OTPs endpoint (for debugging)
router.get('/view-otps', (req, res) => {
  const otps = Array.from(otpStore.entries()).map(([email, data]) => ({
    email,
    otp: data.otp,
    expires: new Date(data.expiresAt).toLocaleTimeString(),
    verified: data.verified,
    attempts: data.attempts
  }));
  
  res.json({
    count: otpStore.size,
    otps: otps,
    note: 'These are currently active OTPs in memory'
  });
});

module.exports = router;
