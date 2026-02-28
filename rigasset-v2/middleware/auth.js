'use strict';
const jwt        = require('jsonwebtoken');
const { query }  = require('../lib/db');

const authenticate = async (req, res, next) => {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authorization token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query(
      'SELECT id, full_name, email, role, department, status FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (!rows.length || rows[0].status !== 'Active')
      return res.status(401).json({ error: 'Account not found or inactive' });
    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return res.status(403).json({ error: 'Invalid token' });
  }
};

const authorize        = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!roles.includes(req.user.role))
    return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}`, yourRole: req.user.role });
  next();
};

const isAdmin          = authorize('Admin');
const isAdminOrManager = authorize('Admin', 'Asset Manager');
const canWrite         = authorize('Admin', 'Asset Manager', 'Operations Manager', 'Editor');

module.exports = { authenticate, authorize, isAdmin, isAdminOrManager, canWrite };
