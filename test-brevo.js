// test-brevo.js
require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('Testing Brevo configuration...');
console.log('Host:', process.env.EMAIL_HOST);
console.log('Port:', process.env.EMAIL_PORT);
console.log('User:', process.env.EMAIL_USER);

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function test() {
  try {
    // Test connection
    await transporter.verify();
    console.log('✅ Connected to Brevo SMTP server');
    
    // Test email send
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: 'your-test-email@gmail.com',
      subject: 'Brevo Test Email',
      text: 'This is a test email from Brevo'
    });
    
    console.log('✅ Test email sent:', info.messageId);
    console.log('✅ Brevo is working correctly!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Code:', error.code);
    
    if (error.code === 'EAUTH') {
      console.log('\n🔑 Authentication failed. Check your:');
      console.log('1. EMAIL_USER (your Brevo account email)');
      console.log('2. EMAIL_PASS (SMTP password from Brevo dashboard)');
      console.log('3. Make sure sender email is verified in Brevo');
    }
  }
}

test();
