'use strict';
const express  = require('express');
const { query } = require('../lib/db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { unread, limit=50 } = req.query;
  const conds = ['(n.user_id=$1 OR n.user_id IS NULL)'];
  const params = [req.user.id];
  if (unread === 'true') conds.push('n.is_read=false');
  const { rows } = await query(
    `SELECT n.* FROM notifications n WHERE ${conds.join(' AND ')}
     ORDER BY n.created_at DESC LIMIT $2`,
    [...params, parseInt(limit)]);
  res.json({ notifications: rows, unreadCount: rows.filter(r=>!r.is_read).length });
}));

router.put('/read-all', asyncHandler(async (req, res) => {
  await query(
    `UPDATE notifications SET is_read=true WHERE (user_id=$1 OR user_id IS NULL) AND is_read=false`,
    [req.user.id]);
  res.json({ message: 'All notifications marked as read' });
}));

router.put('/:id/read', asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read=true WHERE id=$1', [req.params.id]);
  res.json({ message: 'Notification marked as read' });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await query(
    'DELETE FROM notifications WHERE id=$1 AND (user_id=$2 OR user_id IS NULL)',
    [req.params.id, req.user.id]);
  res.json({ message: 'Notification deleted' });
}));

router.delete('/', asyncHandler(async (req, res) => {
  const { rowCount } = await query(
    `DELETE FROM notifications WHERE (user_id=$1 OR user_id IS NULL) AND is_read=true`,
    [req.user.id]);
  res.json({ message: `${rowCount} read notifications cleared` });
}));

module.exports = router;
