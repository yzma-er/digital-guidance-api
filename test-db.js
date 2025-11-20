// test-db.js
const pool = require('./db');

async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT NOW() AS time');
    console.log('✅ Connected to MySQL at:', rows[0].time);
  } catch (err) {
    console.error('❌ Connection failed:', err);
  }
}

testConnection();
