'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query } = require('../lib/db');
const { authenticate, isAdmin, isAdminOrManager } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router  = express.Router();
router.use(authenticate);

const SAFE = 'id, full_name, email, role, department, phone, avatar_color, status, alert_maint, alert_certs, alert_contracts, alert_assets, last_login, created_at';

router.get('/', isAdminOrManager, asyncHandler(async (req, res) => {
  const { role, status, search } = req.query;
  const params=[], conds=[];
  if (role)   { params.push(role);   conds.push(`role=$${params.length}`); }
  if (status) { params.push(status); conds.push(`status=$${params.length}`); }
  if (search) { params.push(`%${search.toLowerCase()}%`); conds.push(`(LOWER(full_name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const { rows } = await query(`SELECT ${SAFE} FROM users ${where} ORDER BY full_name`, params);
  res.json(rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const targetId = req.params.id === 'me' ? req.user.id : req.params.id;
  if (targetId !== req.user.id && !['Admin','Asset Manager'].includes(req.user.role))
    return res.status(403).json({ error: 'Access denied' });
  const { rows } = await query(`SELECT ${SAFE} FROM users WHERE id=$1`, [targetId]);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
}));

router.post('/', isAdmin,
  [body('fullName').trim().notEmpty(), body('email').isEmail().normalizeEmail(),
   body('password').isLength({ min: 8 }),
   body('role').isIn(['Admin','Asset Manager','Operations Manager','Editor','Viewer'])],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { fullName, email, password, role, department, phone, avatarColor='#0070F2' } = req.body;
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (full_name,email,password_hash,role,department,phone,avatar_color)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${SAFE}`,
      [fullName,email,hash,role,department||null,phone||null,avatarColor]);
    res.status(201).json(rows[0]);
  })
);

router.put('/:id', asyncHandler(async (req, res) => {
  const targetId = req.params.id==='me' ? req.user.id : req.params.id;
  const isOwnAccount = targetId === req.user.id;
  const isAdminUser  = req.user.role === 'Admin';
  if (!isOwnAccount && !isAdminUser) return res.status(403).json({ error: 'Access denied' });

  const { fullName, department, phone, avatarColor,
          alertMaint, alertCerts, alertContracts, alertAssets } = req.body;
  const role   = isAdminUser ? req.body.role   : undefined;
  const status = isAdminUser ? req.body.status : undefined;

  const { rows } = await query(`
    UPDATE users SET
      full_name=COALESCE($1,full_name), department=COALESCE($2,department),
      phone=COALESCE($3,phone), avatar_color=COALESCE($4,avatar_color),
      alert_maint=COALESCE($5,alert_maint), alert_certs=COALESCE($6,alert_certs),
      alert_contracts=COALESCE($7,alert_contracts), alert_assets=COALESCE($8,alert_assets),
      role=COALESCE($9,role), status=COALESCE($10,status)
    WHERE id=$11 RETURNING ${SAFE}`,
    [fullName,department,phone,avatarColor,alertMaint,alertCerts,alertContracts,alertAssets,role,status,targetId]);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
}));

router.delete('/:id', isAdmin, asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: 'Cannot delete your own account' });
  const { rows } = await query('DELETE FROM users WHERE id=$1 RETURNING full_name', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json({ message: `User ${rows[0].full_name} deleted` });
}));

router.post('/:id/reset-password', isAdmin,
  [body('newPassword').isLength({ min: 8 })],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const hash = await bcrypt.hash(req.body.newPassword, 12);
    const { rows } = await query(
      'UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING full_name', [hash, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ message: `Password reset for ${rows[0].full_name}` });
  })
);

module.exports = router;
