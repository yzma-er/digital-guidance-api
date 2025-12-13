// routes/auth.js - COMPLETE UPDATED VERSION WITH SINGLE OTP SOURCE
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const crypto = require('crypto');

const router = express.Router();

// OTP storage (use Redis in production)
const otpStore = new Map();
const rateLimits = new Map();

// Generate 6-digit OTP
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Rate limiting
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

// 1. Generate OTP (NEW - for frontend EmailJS)
router.post('/generate-otp', async (req, res) => {
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

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    otpStore.set(email, {
      otp,
      expiresAt,
      attempts: 0,
      createdAt: Date.now(),
      verified: false
    });

    console.log(`📦 OTP generated for ${email}: ${otp}`);
    
    res.json({ 
      success: true, 
      message: 'OTP generated successfully',
      otp: otp, // Send OTP to frontend for email sending
      expiresAt: expiresAt
    });

  } catch (error) {
    console.error('Generate OTP error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to generate OTP.'
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

    console.log(`🔄 New OTP generated for ${email}: ${otp}`);

    res.json({
      success: true,
      message: 'New verification code ready.',
      expiresAt: expiresAt,
      otp: otp // Return OTP for frontend email sending
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate new verification code.'
    });
  }
});

// Updated /login endpoint - Skip OTP for admins
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

    // ADMIN BYPASS: Skip email verification check for admins
    if (user.role === 'admin') {
      console.log(`🔐 Admin login attempt: ${email}`);
      // Allow admin login without email verification
    } 
    // Regular users still need email verification
    else if (!user.email_verified) {
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

    console.log(`✅ Login successful: ${email} (Role: ${user.role})`);
    
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

// Test endpoint - EmailJS only mode
router.get('/test-otp-system', (req, res) => {
  const testEmail = 'test@example.com';
  const otp = generateOTP();
  const expiresAt = Date.now() + 10 * 60 * 1000;
  
  otpStore.set(testEmail, {
    otp,
    expiresAt,
    attempts: 0,
    createdAt: Date.now(),
    verified: false
  });
  
  res.json({
    success: true,
    message: 'OTP system test',
    email: testEmail,
    otp: otp,
    expiresAt: expiresAt,
    mode: 'single_source_backend'
  });
});

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    // Check database
    await pool.query('SELECT 1');
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        email: 'emailjs_frontend_with_backend_otp',
        otp_store: 'running',
        rate_limiting: 'active',
        otp_count: otpStore.size
      },
      note: 'Backend generates OTP → Frontend sends via EmailJS'
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// View OTPs (for debugging/admin only - secure this endpoint in production!)
router.get('/admin/otps', (req, res) => {
  const otps = Array.from(otpStore.entries()).map(([email, data]) => ({
    email,
    otp: data.otp, // Keep OTP visible for debugging admin panel
    expires: new Date(data.expiresAt).toLocaleTimeString(),
    verified: data.verified,
    attempts: data.attempts,
    createdAt: new Date(data.createdAt).toLocaleTimeString()
  }));
  
  res.json({
    count: otpStore.size,
    otps: otps,
    note: 'Active OTPs in memory (admin view)'
  });
});

// Clean expired OTPs (optional cleanup endpoint)
router.post('/cleanup-otps', (req, res) => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [email, data] of otpStore.entries()) {
    if (now > data.expiresAt) {
      otpStore.delete(email);
      cleaned++;
    }
  }
  
  res.json({
    success: true,
    message: `Cleaned ${cleaned} expired OTPs`,
    remaining: otpStore.size
  });
});


// FORGOT PASSWORD ENDPOINTS

// 1. Request password reset (send OTP)
router.post('/forgot-password', async (req, res) => {
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

    // Check if user exists
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];

    if (!user) {
      // Don't reveal that user doesn't exist (security)
      return res.json({ 
        success: true,
        message: 'If your email is registered, you will receive a password reset code.'
      });
    }

    // Check rate limit for password reset
    const rateLimit = checkRateLimit(email, 'password_reset');
    if (!rateLimit.allowed) {
      return res.status(429).json({ 
        success: false,
        message: rateLimit.message,
        retryAfter: rateLimit.retryAfter
      });
    }

    // Generate reset OTP
    const resetOTP = generateOTP();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes for password reset
    
    // Store reset OTP (separate from signup OTP)
    const resetKey = `reset_${email}`;
    otpStore.set(resetKey, {
      otp: resetOTP,
      expiresAt,
      attempts: 0,
      createdAt: Date.now(),
      verified: false,
      purpose: 'password_reset'
    });

    console.log(`🔐 Password reset OTP for ${email}: ${resetOTP}`);
    
    res.json({ 
      success: true,
      message: 'If your email is registered, you will receive a password reset code.',
      otp: resetOTP, // For EmailJS frontend
      expiresAt: expiresAt
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to process password reset request.'
    });
  }
});

// 2. Verify reset OTP
router.post('/verify-reset-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    const resetKey = `reset_${email}`;
    const storedData = otpStore.get(resetKey);

    if (!storedData || storedData.purpose !== 'password_reset') {
      return res.status(400).json({ 
        success: false,
        message: 'No password reset request found. Please request a new one.' 
      });
    }

    // Check expiration
    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(resetKey);
      return res.status(400).json({ 
        success: false,
        message: 'Reset code has expired. Please request a new one.' 
      });
    }

    // Check attempts (max 3)
    if (storedData.attempts >= 3) {
      otpStore.delete(resetKey);
      return res.status(400).json({ 
        success: false,
        message: 'Too many failed attempts. Please request a new reset code.' 
      });
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      storedData.attempts += 1;
      otpStore.set(resetKey, storedData);
      
      return res.status(400).json({ 
        success: false,
        message: 'Invalid reset code.',
        attemptsLeft: 3 - storedData.attempts
      });
    }

    // Mark as verified
    storedData.verified = true;
    otpStore.set(resetKey, storedData);

    // Generate a reset token for the next step
    const resetToken = jwt.sign(
      {
        email: email,
        purpose: 'password_reset',
        otp: otp
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ 
      success: true, 
      message: 'Reset code verified successfully!',
      resetToken: resetToken
    });

  } catch (error) {
    console.error('Reset OTP verification error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Verification failed. Please try again.' 
    });
  }
});

// 3. Reset password with verified OTP
router.post('/reset-password', async (req, res) => {
  const { email, resetToken, newPassword, confirmPassword } = req.body;

  try {
    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or expired reset token. Please restart the process.' 
      });
    }

    // Check if token is for password reset
    if (decoded.purpose !== 'password_reset' || decoded.email !== email) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid reset token.' 
      });
    }

    // Check OTP in storage
    const resetKey = `reset_${email}`;
    const storedData = otpStore.get(resetKey);

    if (!storedData || !storedData.verified || storedData.otp !== decoded.otp) {
      return res.status(400).json({ 
        success: false,
        message: 'Reset session expired. Please restart the process.' 
      });
    }

    // Validate passwords
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Please fill in all password fields.' 
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 8 characters long.' 
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Passwords do not match.' 
      });
    }

    // Check if user exists
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];

    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: 'User not found.' 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password in database
    await pool.query(
      'UPDATE users SET password = ? WHERE email = ?',
      [hashedPassword, email]
    );

    // Clear reset OTP from storage
    otpStore.delete(resetKey);

    console.log(`✅ Password reset for ${email}`);

    res.json({ 
      success: true,
      message: 'Password reset successfully! You can now login with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to reset password. Please try again.' 
    });
  }
});

// 4. Resend reset OTP
router.post('/resend-reset-otp', async (req, res) => {
  const { email } = req.body;

  try {
    const resetKey = `reset_${email}`;
    const storedData = otpStore.get(resetKey);
    const now = Date.now();
    
    if (storedData && storedData.expiresAt > now && (now - storedData.createdAt) < 30000) {
      return res.status(429).json({
        success: false,
        message: 'Please wait 30 seconds before requesting a new code.'
      });
    }

    // Generate new reset OTP
    const resetOTP = generateOTP();
    const expiresAt = now + 15 * 60 * 1000;
    
    otpStore.set(resetKey, {
      otp: resetOTP,
      expiresAt,
      attempts: 0,
      createdAt: now,
      verified: false,
      purpose: 'password_reset'
    });

    console.log(`🔄 New reset OTP for ${email}: ${resetOTP}`);

    res.json({
      success: true,
      message: 'New reset code sent.',
      expiresAt: expiresAt,
      otp: resetOTP // For EmailJS
    });

  } catch (error) {
    console.error('Resend reset OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send new reset code.'
    });
  }
});


module.exports = router;
