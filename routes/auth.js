// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const router = express.Router();

// SendGrid Transporter Setup
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.sendgrid.net',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || 'apikey',
    pass: process.env.EMAIL_PASS
  }
});

// Verify transporter connection on startup
transporter.verify(function(error, success) {
  if (error) {
    console.error('Email transporter error:', error);
  } else {
    console.log('✅ Email server is ready to send messages');
  }
});

// In-memory OTP store
const otpStore = new Map();

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

async function sendOTPEmail(email, otp) {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_USER;
  
  const mailOptions = {
    from: `"Digital Guidance" <${fromEmail}>`,
    to: email,
    subject: 'Verify Your Email - Digital Guidance',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
          .container { padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .otp-code { 
            background: #f8f9fa; 
            padding: 20px; 
            text-align: center; 
            font-size: 32px; 
            font-weight: bold; 
            letter-spacing: 5px; 
            color: #2563eb;
            border-radius: 6px;
            margin: 30px 0;
            font-family: monospace;
          }
          .footer { 
            margin-top: 30px; 
            padding-top: 20px; 
            border-top: 1px solid #e0e0e0; 
            font-size: 12px; 
            color: #666; 
          }
          .warning { 
            background: #fff3cd; 
            border: 1px solid #ffecb5; 
            padding: 10px; 
            border-radius: 4px; 
            margin: 15px 0; 
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="color: #2563eb; margin-bottom: 0;">Digital Guidance</h2>
            <p style="color: #666; margin-top: 5px;">Email Verification</p>
          </div>
          
          <p>Hello,</p>
          <p>Thank you for signing up with Digital Guidance!</p>
          <p>Your verification code is:</p>
          
          <div class="otp-code">${otp}</div>
          
          <div class="warning">
            <strong>⚠️ Important:</strong> This code will expire in 10 minutes.
            Do not share this code with anyone.
          </div>
          
          <p>If you didn't request this verification, please ignore this email.</p>
          
          <div class="footer">
            <p>This is an automated message from <strong>Digital Guidance</strong>.</p>
            <p>© ${new Date().getFullYear()} Digital Guidance. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    // Optional: Plain text version for email clients that don't support HTML
    text: `Your Digital Guidance verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\nThank you,\nDigital Guidance Team`
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('📧 Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw error;
  }
}

// Rate limiting storage
const rateLimits = new Map();

function checkRateLimit(email, type = 'otp_request') {
  const now = Date.now();
  const key = `${email}:${type}`;
  const limit = rateLimits.get(key) || { count: 0, resetTime: now + 3600000 }; // 1 hour
  
  if (now > limit.resetTime) {
    limit.count = 0;
    limit.resetTime = now + 3600000;
  }
  
  if (limit.count >= 5) { // Max 5 requests per hour
    return { allowed: false, retryAfter: Math.ceil((limit.resetTime - now) / 1000) };
  }
  
  limit.count++;
  rateLimits.set(key, limit);
  return { allowed: true };
}

// POST /api/auth/request-otp
router.post('/request-otp', async (req, res) => {
  const { email } = req.body;

  try {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Check rate limit
    const rateLimit = checkRateLimit(email, 'otp_request');
    if (!rateLimit.allowed) {
      return res.status(429).json({ 
        message: `Too many OTP requests. Please try again in ${rateLimit.retryAfter} seconds.` 
      });
    }

    // Check if email already registered
    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with expiration (10 minutes)
    otpStore.set(email, {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
      createdAt: Date.now(),
      verified: false
    });

    // Send OTP email
    await sendOTPEmail(email, otp);

    res.json({ 
      success: true, 
      message: 'Verification code sent to your email.' 
    });

  } catch (err) {
    console.error('OTP request error:', err);
    
    // Handle specific email errors
    if (err.code === 'EAUTH') {
      return res.status(500).json({ 
        message: 'Email configuration error. Please contact support.' 
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to send verification email. Please try again.' 
    });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    const storedData = otpStore.get(email);

    if (!storedData) {
      return res.status(400).json({ 
        success: false,
        message: 'Verification code expired or not found. Please request a new one.' 
      });
    }

    // Check if OTP expired
    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ 
        success: false,
        message: 'Verification code has expired. Please request a new one.' 
      });
    }

    // Check max attempts (3)
    if (storedData.attempts >= 3) {
      otpStore.delete(email);
      return res.status(400).json({ 
        success: false,
        message: 'Too many failed attempts. Please request a new verification code.' 
      });
    }

    if (storedData.otp !== otp) {
      storedData.attempts++;
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

  } catch (err) {
    console.error('OTP verification error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Verification failed. Please try again.' 
    });
  }
});

// POST /api/auth/signup (requires verified email)
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

    // Double-check OTP on signup
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

    // Clear OTP
    otpStore.delete(email);

    // Generate JWT for immediate login
    const token = jwt.sign(
      {
        user_id: result.insertId,
        email: email,
        role: 'user',
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({ 
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: result.insertId,
        email,
        role: 'user'
      }
    });

  } catch (err) {
    console.error('Signup error:', err);
    
    if (err.code === 'ER_DUP_ENTRY') {
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

// Keep your existing login endpoint
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
      { expiresIn: '24h' }
    );

    res.json({ 
      success: true,
      token,
      user: {
        id: user.user_id,
        email: user.email,
        role: user.role
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

module.exports = router;
