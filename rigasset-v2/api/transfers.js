'use strict';
const express  = require('express');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../lib/db');
const { authenticate, canWrite, isAdminOrManager, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

const ENRICHED = `
  SELECT t.*,
         a.name AS asset_name, a.asset_id AS asset_code,
         r.name AS rig_name, dr.name AS dest_rig_name, dc.name AS dest_company_name,
         u.full_name AS requested_by_name,
         ou.full_name AS ops_approver_name, mu.full_name AS mgr_approver_name
  FROM transfers t
  LEFT JOIN assets    a  ON a.id  = t.asset_id
  LEFT JOIN rigs      r  ON r.id  = a.rig_id
  LEFT JOIN rigs      dr ON dr.id = t.dest_rig_id
  LEFT JOIN companies dc ON dc.id = t.dest_company_id
  LEFT JOIN users     u  ON u.id  = t.requested_by
  LEFT JOIN users     ou ON ou.id = t.ops_approved_by
  LEFT JOIN users     mu ON mu.id = t.mgr_approved_by`;

router.get('/', asyncHandler(async (req, res) => {
  const { status, priority, search, page=1, limit=50 } = req.query;
  const params=[], conds=[];
  if (status)   { params.push(status);   conds.push(`t.status=$${params.length}`); }
  if (priority) { params.push(priority); conds.push(`t.priority=$${params.length}`); }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conds.push(`(LOWER(t.transfer_id) LIKE $${params.length} OR LOWER(a.name) LIKE $${params.length})`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const offset = (parseInt(page)-1)*parseInt(limit);
  params.push(parseInt(limit), offset);
  const { rows } = await query(
    `${ENRICHED} ${where} ORDER BY t.request_date DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
    params);
  res.json({ data: rows, total: rows.length });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(`${ENRICHED} WHERE t.id=$1 OR t.transfer_id=$1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Transfer not found' });
  res.json(rows[0]);
}));

router.post('/', canWrite,
  [body('transferId').trim().notEmpty(), body('assetId').notEmpty(),
   body('destination').trim().notEmpty(), body('reason').trim().notEmpty(),
   body('priority').isIn(['Critical','High','Normal','Low'])],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { transferId, assetId, destination, destRigId, destCompanyId,
            priority, transferType='Field to Field', reason, instructions,
            requestDate, requiredDate } = req.body;

    const { rows: ar } = await query('SELECT id, location FROM assets WHERE id=$1 OR asset_id=$1', [assetId]);
    if (!ar.length) return res.status(404).json({ error: 'Asset not found' });

    const { rows } = await query(`
      INSERT INTO transfers
        (transfer_id,asset_id,current_location,destination,dest_rig_id,dest_company_id,
         priority,transfer_type,reason,instructions,requested_by,request_date,required_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [transferId,ar[0].id,ar[0].location,destination,destRigId||null,destCompanyId||null,
       priority,transferType,reason,instructions||null,req.user.id,
       requestDate||new Date().toISOString().slice(0,10),requiredDate||null]);

    // Notify Ops Managers
    await query(`
      INSERT INTO notifications (user_id,type,icon,title,description,entity_type,entity_id)
      SELECT id,'info','exchange-alt','New Transfer Request',$1,'transfer',$2
      FROM users WHERE role='Operations Manager'`,
      [`Transfer ${transferId} submitted for your review`, rows[0].id]);

    res.status(201).json(rows[0]);
  })
);

// Stage 1 — Ops Manager
router.post('/:id/approve-ops',
  authorize('Admin','Operations Manager'),
  asyncHandler(async (req, res) => {
    const { action, comment } = req.body;
    if (!['approve','reject','hold'].includes(action))
      return res.status(400).json({ error: 'action must be approve, reject, or hold' });
    if (!comment?.trim()) return res.status(400).json({ error: 'Comment required' });

    const { rows: tr } = await query('SELECT * FROM transfers WHERE id=$1 OR transfer_id=$1', [req.params.id]);
    if (!tr.length) return res.status(404).json({ error: 'Transfer not found' });
    if (tr[0].status !== 'Pending')
      return res.status(409).json({ error: `Transfer is already ${tr[0].status}` });

    const newStatus = action==='approve' ? 'Ops Approved' : action==='reject' ? 'Rejected' : 'On Hold';
    const { rows } = await query(`
      UPDATE transfers SET ops_approved_by=$1, ops_action=$2, ops_date=CURRENT_DATE, ops_comment=$3, status=$4
      WHERE id=$5 RETURNING *`, [req.user.id, action, comment, newStatus, tr[0].id]);

    if (action === 'approve') {
      await query(`
        INSERT INTO notifications (user_id,type,icon,title,description,entity_type,entity_id)
        SELECT id,'info','user-tie','Transfer Awaiting Final Approval',$1,'transfer',$2
        FROM users WHERE role IN ('Admin','Asset Manager')`,
        [`Transfer ${tr[0].transfer_id} approved by Ops — needs final decision`, tr[0].id]);
    }
    res.json(rows[0]);
  })
);

// Stage 2 — Asset Manager
router.post('/:id/approve-mgr',
  authorize('Admin','Asset Manager'),
  asyncHandler(async (req, res) => {
    const { action, comment } = req.body;
    if (!['approve','reject','hold'].includes(action))
      return res.status(400).json({ error: 'action must be approve, reject, or hold' });
    if (!comment?.trim()) return res.status(400).json({ error: 'Comment required' });

    const { rows: tr } = await query('SELECT * FROM transfers WHERE id=$1 OR transfer_id=$1', [req.params.id]);
    if (!tr.length) return res.status(404).json({ error: 'Transfer not found' });
    if (tr[0].status !== 'Ops Approved')
      return res.status(409).json({ error: `Transfer must be Ops Approved first (currently: ${tr[0].status})` });

    const newStatus = action==='approve' ? 'Completed' : action==='reject' ? 'Rejected' : 'On Hold';
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        UPDATE transfers SET mgr_approved_by=$1, mgr_action=$2, mgr_date=CURRENT_DATE, mgr_comment=$3, status=$4
        WHERE id=$5 RETURNING *`, [req.user.id, action, comment, newStatus, tr[0].id]);

      if (action === 'approve') {
        await client.query(
          `UPDATE assets SET location=$1, rig_id=COALESCE($2,rig_id), company_id=COALESCE($3,company_id) WHERE id=$4`,
          [tr[0].destination, tr[0].dest_rig_id, tr[0].dest_company_id, tr[0].asset_id]);
        await client.query(
          `INSERT INTO asset_history (asset_id,action,changed_by,notes) VALUES ($1,'Transfer Completed',$2,$3)`,
          [tr[0].asset_id, req.user.id, `Transferred to ${tr[0].destination} via ${tr[0].transfer_id}`]);
        await client.query(
          `INSERT INTO notifications (type,icon,title,description,entity_type,entity_id) VALUES ('success','check-double','Transfer Completed',$1,'transfer',$2)`,
          [`Transfer ${tr[0].transfer_id} fully approved — asset relocated`, tr[0].id]);
      }
      await client.query('COMMIT');
      res.json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

router.delete('/:id', canWrite, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `DELETE FROM transfers WHERE (id=$1 OR transfer_id=$1) AND status IN ('Pending','On Hold') RETURNING transfer_id`,
    [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Transfer not found or not cancellable' });
  res.json({ message: `Transfer ${rows[0].transfer_id} cancelled` });
}));

module.exports = router;
