'use strict';
const express  = require('express');
const { query } = require('../lib/db');
const { authenticate, canWrite, isAdminOrManager } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT r.*, c.name AS company_name,
           COUNT(DISTINCT a.id)   AS asset_count,
           COUNT(DISTINCT ms.id)  AS pm_count,
           COUNT(ms.id) FILTER (
             WHERE ms.next_due_date < CURRENT_DATE
               AND ms.status NOT IN ('Completed','Cancelled')
           ) AS overdue_pm
    FROM rigs r
    LEFT JOIN companies c ON c.id = r.company_id
    LEFT JOIN assets a ON a.rig_id = r.id
    LEFT JOIN maintenance_schedules ms ON ms.asset_id = a.id
    GROUP BY r.id, c.name
    ORDER BY r.rig_number NULLS LAST, r.rig_id`);
  res.json(rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT r.*, c.name AS company_name FROM rigs r
     LEFT JOIN companies c ON c.id=r.company_id
     WHERE r.id=$1 OR r.rig_id=$1 OR r.name=$1`,
    [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Rig not found' });
  res.json(rows[0]);
}));

router.post('/', canWrite, asyncHandler(async (req, res) => {
  const { rigId, rigNumber, name, type, companyId, location, depthCapacity,
          depthCapacityFt, horsepower, mastHeightFt, maxHookLoadTon, status, notes } = req.body;
  const { rows } = await query(
    `INSERT INTO rigs
       (rig_id, rig_number, name, type, company_id, location, depth_capacity,
        depth_capacity_ft, horsepower, mast_height_ft, max_hook_load_ton, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [rigId, rigNumber||null, name, type, companyId||null, location||null, depthCapacity||null,
     depthCapacityFt||null, horsepower||null, mastHeightFt||null, maxHookLoadTon||null,
     status||'Active', notes||null]);
  res.status(201).json(rows[0]);
}));

router.put('/:id', canWrite, asyncHandler(async (req, res) => {
  const { name, type, companyId, location, depthCapacity, depthCapacityFt,
          horsepower, mastHeightFt, maxHookLoadTon, status, notes } = req.body;
  const { rows } = await query(
    `UPDATE rigs SET
       name=COALESCE($1,name), type=COALESCE($2,type), company_id=COALESCE($3,company_id),
       location=COALESCE($4,location), depth_capacity=COALESCE($5,depth_capacity),
       depth_capacity_ft=COALESCE($6,depth_capacity_ft), horsepower=COALESCE($7,horsepower),
       mast_height_ft=COALESCE($8,mast_height_ft), max_hook_load_ton=COALESCE($9,max_hook_load_ton),
       status=COALESCE($10,status), notes=COALESCE($11,notes)
     WHERE id=$12 OR rig_id=$12 RETURNING *`,
    [name,type,companyId,location,depthCapacity,depthCapacityFt,horsepower,
     mastHeightFt,maxHookLoadTon,status,notes,req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Rig not found' });
  res.json(rows[0]);
}));

router.delete('/:id', isAdminOrManager, asyncHandler(async (req, res) => {
  const { rows } = await query(
    'DELETE FROM rigs WHERE id=$1 OR rig_id=$1 RETURNING rig_id, name', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Rig not found' });
  res.json({ message: `Rig ${rows[0].rig_id} deleted` });
}));

module.exports = router;
