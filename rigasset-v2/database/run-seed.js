'use strict';
// Run:  node database/run-seed.js
// Inserts demo data (14 rigs, 24 assets, 6 users, maintenance schedules…)
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
  console.log('🌱  Inserting seed data...');
  try {
    await pool.query(sql);
    console.log('✅  Seed data inserted. Default password: RigAsset2025!');
  } catch (err) {
    console.error('❌  Seed error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
