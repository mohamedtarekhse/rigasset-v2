'use strict';
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const { ping }   = require('./lib/db');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// ── Route modules ─────────────────────────────────────────────
const authRouter    = require('./api/auth');
const dashRouter    = require('./api/dashboard');
const assetsRouter  = require('./api/assets');
const rigsRouter    = require('./api/rigs');
const companiesRouter = require('./api/companies');
const contractsRouter = require('./api/contracts');
const maintRouter   = require('./api/maintenance');
const transfersRouter = require('./api/transfers');
const bomRouter     = require('./api/bom');
const usersRouter   = require('./api/users');
const notifsRouter  = require('./api/notifications');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security ──────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no Origin header (Postman, curl, same-origin)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// ── Parsing + logging ─────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Rate limiting ─────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max:      parseInt(process.env.RATE_LIMIT_MAX       || '200'),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests, please try again later.' },
}));

app.use(['/api/auth/login', '/api/auth/register'], rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again in 15 minutes.' },
}));

// ── Health check (GET / and GET /health) ──────────────────────
// Both paths respond — covers Vercel, Railway, Render, and browser tests
const healthHandler = async (_req, res) => {
  try {
    const dbTime = await ping();
    res.json({
      status:      'ok',
      service:     'RigAsset Pro API',
      version:     '2.0.0',
      timestamp:   new Date().toISOString(),
      db:          'connected',
      db_time:     dbTime,
      environment: process.env.NODE_ENV || 'development',
      docs:        '/api',
    });
  } catch (err) {
    console.error('[health] DB ping failed:', err.message);
    res.status(503).json({
      status:  'error',
      db:      'disconnected',
      reason:  err.message,
      hint:    'Check DATABASE_URL in Vercel environment variables. Use Supabase Transaction Pooler URL (port 6543).',
    });
  }
};

app.get('/',       healthHandler);
app.get('/health', healthHandler);

// ── API routes ────────────────────────────────────────────────
app.use('/api/auth',          authRouter);
app.use('/api/dashboard',     dashRouter);
app.use('/api/assets',        assetsRouter);
app.use('/api/rigs',          rigsRouter);
app.use('/api/companies',     companiesRouter);
app.use('/api/contracts',     contractsRouter);
app.use('/api/maintenance',   maintRouter);
app.use('/api/transfers',     transfersRouter);
app.use('/api/bom',           bomRouter);
app.use('/api/users',         usersRouter);
app.use('/api/notifications', notifsRouter);

// ── API index ─────────────────────────────────────────────────
app.get('/api', (_req, res) => {
  res.json({
    service: 'RigAsset Pro API v2',
    health:  '/',
    endpoints: [
      'POST   /api/auth/login',
      'POST   /api/auth/register',
      'POST   /api/auth/refresh',
      'POST   /api/auth/logout',
      'GET    /api/auth/me',
      'PUT    /api/auth/change-password',
      'GET    /api/dashboard',
      'GET    /api/assets               ?rig=&company=&status=&category=&search=&page=&limit=',
      'GET    /api/assets/summary',
      'GET    /api/assets/by-rig',
      'GET    /api/assets/:id',
      'POST   /api/assets',
      'PUT    /api/assets/:id',
      'DELETE /api/assets/:id',
      'GET    /api/assets/:id/history',
      'GET    /api/rigs',
      'GET    /api/rigs/:id',
      'POST   /api/rigs',
      'PUT    /api/rigs/:id',
      'DELETE /api/rigs/:id',
      'GET    /api/companies',
      'GET    /api/companies/:id',
      'POST   /api/companies',
      'PUT    /api/companies/:id',
      'DELETE /api/companies/:id',
      'GET    /api/contracts            ?status=&company=&rig=',
      'GET    /api/contracts/expiring   ?days=30',
      'GET    /api/contracts/:id',
      'POST   /api/contracts',
      'PUT    /api/contracts/:id',
      'DELETE /api/contracts/:id',
      'GET    /api/maintenance          ?rig=&asset=&status=&priority=&type=',
      'GET    /api/maintenance/alerts',
      'GET    /api/maintenance/by-rig',
      'GET    /api/maintenance/:id',
      'POST   /api/maintenance',
      'PUT    /api/maintenance/:id',
      'POST   /api/maintenance/:id/complete',
      'GET    /api/maintenance/:id/logs',
      'DELETE /api/maintenance/:id',
      'GET    /api/transfers            ?status=&priority=',
      'GET    /api/transfers/:id',
      'POST   /api/transfers',
      'POST   /api/transfers/:id/approve-ops',
      'POST   /api/transfers/:id/approve-mgr',
      'DELETE /api/transfers/:id',
      'GET    /api/bom                  ?assetId=&rigName=&type=&status=',
      'GET    /api/bom/tree/:assetId',
      'GET    /api/bom/:id',
      'POST   /api/bom',
      'PUT    /api/bom/:id',
      'DELETE /api/bom/:id',
      'GET    /api/users',
      'GET    /api/users/:id',
      'POST   /api/users',
      'PUT    /api/users/:id',
      'DELETE /api/users/:id',
      'POST   /api/users/:id/reset-password',
      'GET    /api/notifications        ?unread=true&limit=50',
      'PUT    /api/notifications/read-all',
      'PUT    /api/notifications/:id/read',
      'DELETE /api/notifications/:id',
      'DELETE /api/notifications',
    ],
  });
});

// ── Error handling (must be last) ─────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start (local dev only — Vercel uses module.exports) ───────
if (process.env.NODE_ENV !== 'production' || process.env.FORCE_LISTEN) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀  RigAsset Pro API v2`);
    console.log(`    http://localhost:${PORT}/`);
    console.log(`    http://localhost:${PORT}/api\n`);
  });
}

// Vercel requires the Express app to be exported
module.exports = app;
