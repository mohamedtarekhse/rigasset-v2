'use strict';
const express  = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../lib/db');
const { authenticate, canWrite, isAdminOrManager } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// GET /api/maintenance
router.get('/', asyncHandler(async (req, res) => {
  const { rig, asset, status, priority, type, search, page=1, limit=100 } = req.query;
  const params = [], conds = [];

  if (rig)      { params.push(rig);      conds.push(`r.name=$${params.length}`); }
  if (asset)    { params.push(asset);    conds.push(`(a.asset_id=$${params.length} OR a.id::text=$${params.length})`); }
  if (priority) { params.push(priority); conds.push(`ms.priority=$${params.length}`); }
  if (type)     { params.push(type);     conds.push(`ms.task_type=$${params.length}`); }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conds.push(`(LOWER(ms.task_name) LIKE $${params.length} OR LOWER(a.name) LIKE $${params.length} OR LOWER(ms.technician) LIKE $${params.length})`);
  }
  if (status === 'Overdue') {
    conds.push(`ms.next_due_date < CURRENT_DATE AND ms.status NOT IN ('Completed','Cancelled')`);
  } else if (status === 'Due Soon') {
    conds.push(`ms.next_due_date >= CURRENT_DATE AND ms.next_due_date <= CURRENT_DATE + ms.alert_days AND ms.status NOT IN ('Completed','Cancelled')`);
  } else if (status) {
    params.push(status); conds.push(`ms.status=$${params.length}`);
  }

  const where  = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);
  params.push(parseInt(limit), offset);

  const { rows } = await query(`
    SELECT ms.*,
           a.name AS asset_name, a.asset_id AS asset_code, a.location AS asset_location,
           r.name AS rig_name, r.rig_id AS rig_code, r.rig_number,
           (ms.next_due_date - CURRENT_DATE) AS days_until_due,
           CASE
             WHEN ms.status IN ('Completed','Cancelled','In Progress') THEN ms.status
             WHEN ms.next_due_date < CURRENT_DATE                      THEN 'Overdue'
             WHEN ms.next_due_date <= CURRENT_DATE + ms.alert_days     THEN 'Due Soon'
             ELSE 'Scheduled'
           END AS live_status,
           COUNT(ml.id) AS log_count
    FROM maintenance_schedules ms
    LEFT JOIN assets a  ON a.id=ms.asset_id
    LEFT JOIN rigs   r  ON r.id=a.rig_id
    LEFT JOIN maintenance_logs ml ON ml.schedule_id=ms.id
    ${where}
    GROUP BY ms.id, a.name, a.asset_id, a.location, r.name, r.rig_id, r.rig_number
    ORDER BY
      CASE WHEN ms.status NOT IN ('Completed','Cancelled') AND ms.next_due_date < CURRENT_DATE THEN 1
           WHEN ms.status NOT IN ('Completed','Cancelled') AND ms.next_due_date <= CURRENT_DATE + ms.alert_days THEN 2
           ELSE 3 END, ms.next_due_date ASC
    LIMIT $${params.length-1} OFFSET $${params.length}`, params);

  res.json({ data: rows, total: rows.length });
}));

// GET /api/maintenance/alerts
router.get('/alerts', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT ms.*, a.name AS asset_name, a.asset_id AS asset_code,
           r.name AS rig_name, r.rig_id AS rig_code,
           (ms.next_due_date - CURRENT_DATE) AS days_until_due,
           CASE WHEN ms.next_due_date < CURRENT_DATE THEN 'Overdue' ELSE 'Due Soon' END AS alert_type
    FROM maintenance_schedules ms
    LEFT JOIN assets a ON a.id=ms.asset_id
    LEFT JOIN rigs   r ON r.id=a.rig_id
    WHERE ms.status NOT IN ('Completed','Cancelled')
      AND ms.next_due_date <= CURRENT_DATE + ms.alert_days
    ORDER BY ms.next_due_date ASC`);
  res.json({ alerts: rows, overdue: rows.filter(r => r.alert_type === 'Overdue').length });
}));

// GET /api/maintenance/by-rig
router.get('/by-rig', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT r.rig_id, r.rig_number, r.name AS rig_name, r.status AS rig_status,
           COUNT(ms.id) AS total_tasks,
           COUNT(ms.id) FILTER (WHERE ms.next_due_date < CURRENT_DATE AND ms.status NOT IN ('Completed','Cancelled')) AS overdue,
           COUNT(ms.id) FILTER (WHERE ms.next_due_date >= CURRENT_DATE AND ms.next_due_date <= CURRENT_DATE + ms.alert_days AND ms.status NOT IN ('Completed','Cancelled')) AS due_soon,
           COUNT(ms.id) FILTER (WHERE ms.status = 'Completed') AS completed
    FROM rigs r
    LEFT JOIN assets a ON a.rig_id=r.id
    LEFT JOIN maintenance_schedules ms ON ms.asset_id=a.id
    GROUP BY r.id, r.rig_id, r.rig_number, r.name, r.status
    ORDER BY r.rig_number NULLS LAST, r.rig_id`);
  res.json(rows);
}));

// GET /api/maintenance/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT ms.*, a.name AS asset_name, a.asset_id AS asset_code,
           r.name AS rig_name, (ms.next_due_date - CURRENT_DATE) AS days_until_due
    FROM maintenance_schedules ms
    LEFT JOIN assets a ON a.id=ms.asset_id
    LEFT JOIN rigs   r ON r.id=a.rig_id
    WHERE ms.id=$1 OR ms.pm_id=$1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Schedule not found' });

  const { rows: logs } = await query(
    'SELECT * FROM maintenance_logs WHERE schedule_id=$1 ORDER BY completion_date DESC',
    [rows[0].id]);
  res.json({ ...rows[0], logs });
}));

// POST /api/maintenance
router.post('/', canWrite,
  [body('pmId').trim().notEmpty(), body('assetId').notEmpty(),
   body('taskName').trim().notEmpty(), body('taskType').notEmpty(),
   body('nextDueDate').isDate(), body('frequencyDays').isInt({ min: 1 })],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { pmId, assetId, taskName, taskType, priority='Normal', frequencyDays,
            lastDoneDate, nextDueDate, alertDays=14, technician, estimatedHours,
            estimatedCost, workOrderNo, status='Scheduled', notes } = req.body;

    const { rows: ar } = await query('SELECT id FROM assets WHERE id=$1 OR asset_id=$1', [assetId]);
    if (!ar.length) return res.status(404).json({ error: 'Asset not found' });

    const { rows } = await query(`
      INSERT INTO maintenance_schedules
        (pm_id,asset_id,task_name,task_type,priority,frequency_days,last_done_date,
         next_due_date,alert_days,technician,estimated_hours,estimated_cost,work_order_no,status,notes,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [pmId,ar[0].id,taskName,taskType,priority,frequencyDays,lastDoneDate||null,
       nextDueDate,alertDays,technician||null,estimatedHours||null,estimatedCost||null,
       workOrderNo||null,status,notes||null,req.user.id]);
    res.status(201).json(rows[0]);
  })
);

// PUT /api/maintenance/:id
router.put('/:id', canWrite, asyncHandler(async (req, res) => {
  const { rows: ex } = await query('SELECT id FROM maintenance_schedules WHERE id=$1 OR pm_id=$1', [req.params.id]);
  if (!ex.length) return res.status(404).json({ error: 'Schedule not found' });

  const { taskName, taskType, priority, frequencyDays, lastDoneDate, nextDueDate,
          alertDays, technician, estimatedHours, estimatedCost, workOrderNo, status, notes } = req.body;

  const { rows } = await query(`
    UPDATE maintenance_schedules SET
      task_name=COALESCE($1,task_name), task_type=COALESCE($2,task_type),
      priority=COALESCE($3,priority), frequency_days=COALESCE($4,frequency_days),
      last_done_date=COALESCE($5,last_done_date), next_due_date=COALESCE($6,next_due_date),
      alert_days=COALESCE($7,alert_days), technician=COALESCE($8,technician),
      estimated_hours=COALESCE($9,estimated_hours), estimated_cost=COALESCE($10,estimated_cost),
      work_order_no=COALESCE($11,work_order_no), status=COALESCE($12,status), notes=COALESCE($13,notes)
    WHERE id=$14 RETURNING *`,
    [taskName,taskType,priority,frequencyDays,lastDoneDate,nextDueDate,alertDays,
     technician,estimatedHours,estimatedCost,workOrderNo,status,notes,ex[0].id]);
  res.json(rows[0]);
}));

// POST /api/maintenance/:id/complete
router.post('/:id/complete', canWrite, asyncHandler(async (req, res) => {
  const { rows: s } = await query('SELECT * FROM maintenance_schedules WHERE id=$1 OR pm_id=$1', [req.params.id]);
  if (!s.length) return res.status(404).json({ error: 'Schedule not found' });

  const { completionDate, completedBy, actualHours, actualCost, partsUsed, workNotes, nextDueDate } = req.body;
  if (!completionDate || !completedBy)
    return res.status(400).json({ error: 'completionDate and completedBy required' });

  const computedNext = nextDueDate ||
    new Date(new Date(completionDate).getTime() + s[0].frequency_days * 86400000).toISOString().slice(0,10);

  const { rows: log } = await query(`
    INSERT INTO maintenance_logs
      (schedule_id,completion_date,completed_by,actual_hours,actual_cost,parts_used,work_notes,next_due_date)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [s[0].id,completionDate,completedBy,actualHours||null,actualCost||null,partsUsed||null,workNotes||null,computedNext]);

  const { rows: updated } = await query(
    `UPDATE maintenance_schedules SET last_done_date=$1, next_due_date=$2, status='Scheduled' WHERE id=$3 RETURNING *`,
    [completionDate, computedNext, s[0].id]);

  res.json({ schedule: updated[0], log: log[0] });
}));

// GET /api/maintenance/:id/logs
router.get('/:id/logs', asyncHandler(async (req, res) => {
  const { rows: s } = await query('SELECT id FROM maintenance_schedules WHERE id=$1 OR pm_id=$1', [req.params.id]);
  if (!s.length) return res.status(404).json({ error: 'Schedule not found' });
  const { rows } = await query(
    'SELECT * FROM maintenance_logs WHERE schedule_id=$1 ORDER BY completion_date DESC', [s[0].id]);
  res.json(rows);
}));

// DELETE /api/maintenance/:id
router.delete('/:id', isAdminOrManager, asyncHandler(async (req, res) => {
  const { rows } = await query(
    'DELETE FROM maintenance_schedules WHERE id=$1 OR pm_id=$1 RETURNING pm_id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Schedule not found' });
  res.json({ message: `Schedule ${rows[0].pm_id} deleted` });
}));

module.exports = router;
