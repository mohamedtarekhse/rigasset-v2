'use strict';

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  if (err.code === '23505') return res.status(409).json({ error: 'Duplicate entry', detail: err.detail });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced record not found', detail: err.detail });
  if (err.code === '23514') return res.status(400).json({ error: 'Invalid field value', detail: err.detail });

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

const notFound = (req, res) =>
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });

module.exports = { asyncHandler, errorHandler, notFound };
