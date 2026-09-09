const express = require('express');
const { rowToCamel, requireAdmin } = require('../src/middleware');
const { requireSelfOrAdmin } = require('../src/auth');

function receiptsRouter(pool) {
  const router = express.Router();

  router.get('/', requireAdmin, async (req, res) => {
    const { rows } = await pool.query('select * from receipts order by ts desc limit 200');
    res.json(rows.map(rowToCamel));
  });

  router.get('/user/:userId', requireSelfOrAdmin('userId'), async (req, res) => {
    const { rows } = await pool.query('select * from receipts where user_id=$1 order by ts desc', [req.params.userId]);
    res.json(rows.map(rowToCamel));
  });

  return router;
}

module.exports = { receiptsRouter };
