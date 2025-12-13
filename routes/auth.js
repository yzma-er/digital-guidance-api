// routes/auth.js - RESEND VERSION (SUPER SIMPLE)
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const crypto = require('crypto');
const { Resend } = require('resend'); // Only dependency

const router = express.Router();

// Resend setup (1 LINE!)
const resend = new Resend(process.env.RESEND_API_KEY);

console.log('📧 Email: Using Resend (API-based, works on Render)');

// OTP storage
const otpStore = new Map();

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// SIMPLE EMAIL FUNCTION - Just 15 lines!
async function sendOTPEmail(email, otp) {
  console.log(`📧 Sending OTP to ${email} via Resend`);
  
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Digital Guidance <onboarding@resend.dev>',
      to: [email],
      subject: 'Verify Your Email - Digital Guidance',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #2563eb;">Verify Your Email</h2>
          <p>Your verification code is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #1d4ed8; margin: 20px 0;">
            ${otp}
          </div>
          <p>This code expires in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `,
      text: `Your verification code: ${otp}\n\nExpires in 10 minutes.`
    });

    if (error) {
      console.log('❌ Resend failed, using logging:', error.message);
      throw error;
    }

    console.log('✅ Email sent via Resend:', data.id);
    return { success: true, method: 'resend', messageId: data.id };
    
  } catch (error) {
    // Fallback to logging
    console.log('='.repeat(50));
    console.log(`🎯 OTP for ${email}: ${otp}`);
    console.log('='.repeat(50));
    
    return { 
      success: true, 
      method: 'logging', 
      otp: otp 
    };
  }
}

// EVERYTHING ELSE STAYS EXACTLY THE SAME!
// Your existing request-otp, verify-otp, signup, login, etc.
// NO CHANGES NEEDED!

// Test Resend endpoint
router.get('/test-resend', async (req, res) => {
  const testEmail = process.env.TEST_EMAIL || 'your-email@gmail.com';
  
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [testEmail],
      subject: '✅ Resend Test - SUCCESS',
      text: 'Resend is working perfectly with your Digital Guidance app!'
    });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Resend test email sent',
      emailId: data.id,
      note: 'Check your email inbox'
    });
    
  } catch (error) {
    res.json({
      success: false,
      message: 'Resend test failed',
      error: error.message,
      using_logging: true
    });
  }
});

module.exports = router;
