'use strict';
const express  = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../lib/db');
const { authenticate, canWrite, isAdminOrManager } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { status, search } = req.query;
  const params = [], conds = [];
  if (status) { params.push(status); conds.push(`c.status=$${params.length}`); }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conds.push(`(LOWER(c.name) LIKE $${params.length} OR LOWER(c.contact_name) LIKE $${params.length})`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const { rows } = await query(`
    SELECT c.*, COUNT(DISTINCT ct.id) AS contract_count,
           COUNT(DISTINCT r.id) AS rig_count, COUNT(DISTINCT a.id) AS asset_count
    FROM companies c
    LEFT JOIN contracts ct ON ct.company_id=c.id
    LEFT JOIN rigs      r  ON r.company_id=c.id
    LEFT JOIN assets    a  ON a.company_id=c.id
    ${where} GROUP BY c.id ORDER BY c.name`, params);
  res.json(rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM companies WHERE id=$1 OR company_code=$1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Company not found' });
  res.json(rows[0]);
}));

router.post('/', canWrite,
  [body('companyCode').trim().notEmpty(), body('name').trim().notEmpty(),
   body('type').isIn(['Drilling Contractor','Operator','Service Company','Other'])],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { companyCode, name, type, country, contactName, contactEmail, contactPhone, address, website, status='Active' } = req.body;
    const { rows } = await query(
      `INSERT INTO companies (company_code,name,type,country,contact_name,contact_email,contact_phone,address,website,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [companyCode,name,type,country||null,contactName||null,contactEmail||null,contactPhone||null,address||null,website||null,status]);
    res.status(201).json(rows[0]);
  })
);

router.put('/:id', canWrite, asyncHandler(async (req, res) => {
  const { name, type, country, contactName, contactEmail, contactPhone, address, website, status } = req.body;
  const { rows } = await query(
    `UPDATE companies SET name=COALESCE($1,name), type=COALESCE($2,type), country=COALESCE($3,country),
       contact_name=COALESCE($4,contact_name), contact_email=COALESCE($5,contact_email),
       contact_phone=COALESCE($6,contact_phone), address=COALESCE($7,address),
       website=COALESCE($8,website), status=COALESCE($9,status)
     WHERE id=$10 OR company_code=$10 RETURNING *`,
    [name,type,country,contactName,contactEmail,contactPhone,address,website,status,req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Company not found' });
  res.json(rows[0]);
}));

router.delete('/:id', isAdminOrManager, asyncHandler(async (req, res) => {
  const { rows } = await query(
    'DELETE FROM companies WHERE id=$1 OR company_code=$1 RETURNING name', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Company not found' });
  res.json({ message: `Company ${rows[0].name} deleted` });
}));

module.exports = router;
