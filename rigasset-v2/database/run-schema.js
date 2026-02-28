'use strict';
// Run:  node database/run-schema.js
// Applies schema.sql to your Supabase database via DATABASE_URL
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set. Copy .env.example → .env and fill it in.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('🔧  Applying schema.sql to Supabase...');
  try {
    await pool.query(sql);
    console.log('✅  Schema applied successfully.');
  } catch (err) {
    console.error('❌  Schema error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
