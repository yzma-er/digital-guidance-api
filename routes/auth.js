// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const router = express.Router();

// Brevo Transporter Setup
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Test connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email server connection failed:', error.message);
  } else {
    console.log('✅ Email server is ready to send messages');
  }
});

// OTP storage (use Redis in production)
const otpStore = new Map();

// Generate 6-digit OTP
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Send OTP email via Brevo
async function sendOTPEmail(email, otp) {
  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Digital Guidance" <verify@digitalguidance.com>',
    to: email,
    subject: 'Verify Your Email - Digital Guidance',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            background-color: #f9fafb;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            margin: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
          }
          .logo {
            color: #2563eb;
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 10px;
          }
          .tagline {
            color: #6b7280;
            font-size: 16px;
          }
          .otp-container {
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            border-radius: 10px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
            border: 2px dashed #93c5fd;
          }
          .otp-code {
            font-size: 42px;
            font-weight: bold;
            letter-spacing: 10px;
            color: #1d4ed8;
            font-family: 'Courier New', monospace;
            margin: 20px 0;
          }
          .timer {
            color: #dc2626;
            font-size: 14px;
            font-weight: 500;
            margin-top: 15px;
          }
          .instructions {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            border-radius: 6px;
            margin: 25px 0;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 13px;
          }
          .button {
            display: inline-block;
            background: #2563eb;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Digital Guidance</div>
            <div class="tagline">Your trusted learning companion</div>
          </div>
          
          <h2 style="color: #1f2937; margin-bottom: 20px;">Email Verification Required</h2>
          
          <p>Hello,</p>
          <p>You're almost ready to start your journey with Digital Guidance! To complete your registration, please use the verification code below:</p>
          
          <div class="otp-container">
            <div style="color: #4b5563; margin-bottom: 10px;">Your verification code:</div>
            <div class="otp-code">${otp}</div>
            <div class="timer">⏰ Expires in 10 minutes</div>
          </div>
          
          <div class="instructions">
            <strong>📝 Important:</strong>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>Enter this code in the verification page</li>
              <li>Do not share this code with anyone</li>
              <li>If you didn't request this, please ignore this email</li>
            </ul>
          </div>
          
          <p style="margin-top: 30px;">Need help? Contact our support team or reply to this email.</p>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} Digital Guidance. All rights reserved.</p>
            <p>This is an automated message, please do not reply directly to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    // Text version for email clients that don't support HTML
    text: `
Digital Guidance - Email Verification
======================================

Your verification code is: ${otp}

Enter this code in the verification page to complete your registration.

This code will expire in 10 minutes.

If you didn't request this verification, please ignore this email.

Need help? Contact our support team.

© ${new Date().getFullYear()} Digital Guidance. All rights reserved.
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 OTP email sent to ${email}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send OTP email to ${email}:`, error.message);
    throw error;
  }
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

// 1. Request OTP
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

    // Send OTP email
    await sendOTPEmail(email, otp);

    res.json({ 
      success: true, 
      message: 'Verification code sent to your email.',
      expiresAt: expiresAt
    });

  } catch (error) {
    console.error('OTP request error:', error);
    
    // Handle specific email errors
    if (error.code === 'EAUTH') {
      return res.status(500).json({ 
        success: false,
        message: 'Email service configuration error. Please contact support.' 
      });
    }
    
    if (error.code === 'EENVELOPE') {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid email address. Please check and try again.' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Failed to send verification email. Please try again in a few minutes.' 
    });
  }
});

// 2. Verify OTP
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

// 3. Complete signup
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

// 4. Resend OTP
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

    // Send new OTP
    await sendOTPEmail(email, otp);

    res.json({
      success: true,
      message: 'New verification code sent.',
      expiresAt: expiresAt
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification code.'
    });
  }
});

// Keep existing login endpoint
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

// Test email endpoint
router.get('/test-email', async (req, res) => {
  const testEmail = process.env.TEST_EMAIL || 'your-test-email@gmail.com';
  
  try {
    const result = await sendOTPEmail(testEmail, '123456');
    res.json({ 
      success: true, 
      message: 'Test email sent successfully',
      details: result 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Test email failed',
      error: error.message 
    });
  }
});

module.exports = router;
