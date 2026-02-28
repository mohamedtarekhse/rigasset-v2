'use strict';
// lib/db.js
// Supabase + Vercel serverless PostgreSQL connection.
//
// KEY DECISIONS:
//   max:3          — keeps connection count low for serverless invocations
//   ssl:true       — Supabase requires SSL on every connection
//   port 6543      — use Supabase Transaction Pooler (not direct 5432)
//   allowExitOnIdle— lets Vercel function process exit cleanly

require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. See .env.example');
  process.exit(1);
}

const pool = new Pool({
  connectionString:        process.env.DATABASE_URL,
  ssl:                     { rejectUnauthorized: false },  // required for Supabase
  max:                     3,
  idleTimeoutMillis:       10000,
  connectionTimeoutMillis: 8000,
  allowExitOnIdle:         true,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

const query     = (text, params) => pool.query(text, params);
const getClient = ()             => pool.connect();
const ping      = async ()       => {
  const { rows } = await pool.query('SELECT NOW() AS ts');
  return rows[0].ts;
};

module.exports = { pool, query, getClient, ping };
