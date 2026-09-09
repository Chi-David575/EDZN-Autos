const express = require('express');
const { rowToCamel, requireAdmin } = require('../src/middleware');
const { authenticateToken, requireSelfOrAdmin } = require('../src/auth');

const STAGES_BY_TYPE = {
  towing: ['Requested', 'Tow driver assigned', 'Driver en route', 'Vehicle towed', 'Completed'],
  mechanic: ['Requested', 'Mechanic assigned', 'Mechanic en route', 'Repair in progress', 'Completed'],
  mechanic_booking: ['Requested', 'Mechanic confirmed', 'Scheduled', 'Completed'],
  parts_purchase: ['Order placed', 'Payment confirmed', 'Packed', 'Out for delivery', 'Delivered'],
  oil_purchase: ['Order placed', 'Payment confirmed', 'Out for delivery', 'Delivered'],
  rental: ['Requested', 'Vehicle confirmed', 'Handover scheduled', 'Active']
};
const TERMINAL = new Set(['Completed', 'Delivered', 'Active']);

function ordersRouter(pool) {
  const router = express.Router();

  router.post('/', authenticateToken, async (req, res) => {
    const { type, details, amount } = req.body;
    if (!type) return res.status(400).json({ error: 'type is required' });
    const userId = req.user.userId;
    const parsedAmount = Number(amount);
    if (amount != null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userRes = await client.query('select * from users where id=$1', [userId]);
      const user = userRes.rows[0];
      if (!user) {
        await client.query('ROLLBACK');
        return res.status(401).json({ error: 'User not found' });
      }
      const location = { lat: user.lat, lng: user.lng, label: user.location_label };
      const stages = JSON.stringify([{ label: (STAGES_BY_TYPE[type] || ['Requested'])[0], ts: Date.now() }]);

      const orderRes = await client.query(
        `insert into orders (type, user_id, user_name, details, amount, location, stages)
         values ($1,$2,$3,$4,$5,$6,$7) returning *`,
        [type, userId, user.name, details || {}, parsedAmount || 0, location, stages]
      );
      const order = orderRes.rows[0];

      const receiptRes = await client.query(
        `insert into receipts (order_id, user_id, user_name, amount, type, location)
         values ($1,$2,$3,$4,$5,$6) returning *`,
        [order.id, userId, order.user_name, order.amount, type, location]
      );

      await client.query('COMMIT');
      res.status(201).json({ order: rowToCamel(order), receipt: rowToCamel(receiptRes.rows[0]) });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: 'Failed to create order' });
    } finally {
      client.release();
    }
  });

  router.post('/:id/advance', requireAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query('select * from orders where id=$1', [req.params.id]);
      const order = rows[0];
      if (!order) return res.status(404).json({ error: 'Not found' });
      const sequence = STAGES_BY_TYPE[order.type] || ['Requested', 'Processing', 'Completed'];
      const currentLabels = order.stages.map((s) => s.label);
      const nextLabel = sequence.find((l) => !currentLabels.includes(l));
      if (!nextLabel) return res.json(rowToCamel(order));
      const newStages = [...order.stages, { label: nextLabel, ts: Date.now() }];
      const newStatus = TERMINAL.has(nextLabel) ? 'completed' : 'in_progress';
      const { rows: updated } = await pool.query(
        'update orders set stages=$1, status=$2 where id=$3 returning *',
        [JSON.stringify(newStages), newStatus, order.id]
      );
      res.json(rowToCamel(updated[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to advance order' });
    }
  });

  router.get('/', requireAdmin, async (req, res) => {
    const { rows } = await pool.query('select * from orders order by created_at desc limit 200');
    res.json(rows.map(rowToCamel));
  });

  router.get('/user/:userId', requireSelfOrAdmin('userId'), async (req, res) => {
    const { rows } = await pool.query('select * from orders where user_id=$1 order by created_at desc', [req.params.userId]);
    res.json(rows.map(rowToCamel));
  });

  router.get('/:id', authenticateToken, async (req, res) => {
    const { rows } = await pool.query('select * from orders where id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const order = rows[0];
    if (order.user_id && String(order.user_id) !== String(req.user.userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(rowToCamel(order));
  });

  router.delete('/:id', requireAdmin, async (req, res) => {
    await pool.query('delete from orders where id=$1', [req.params.id]);
    res.json({ deleted: true });
  });

  return router;
}

module.exports = { ordersRouter, STAGES_BY_TYPE };
