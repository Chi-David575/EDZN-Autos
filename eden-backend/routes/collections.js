const express = require('express');
const { rowToCamel, requireAdmin } = require('../src/middleware');

/**
 * Builds a small REST router (list, create, update, delete) for one of the
 * straightforward reference tables — mechanics, parts sellers, dispatch
 * riders, parts, oil products, rentals. These all follow the same shape:
 * list everyone can read, create is open (registration/checkout), delete is
 * admin-only (the "monitor and control" requirement).
 *
 * @param {import('pg').Pool} pool
 * @param {{table:string, fields:{js:string, sql:string, array?:boolean}[], orderBy?:string}} cfg
 */
function makeCollectionRouter(pool, cfg) {
  const router = express.Router();
  const { table, fields, orderBy = 'created_at desc' } = cfg;

  router.get('/', async (req, res) => {
    try {
      const { rows } = await pool.query(`select * from ${table} order by ${orderBy}`);
      res.json(rows.map(rowToCamel));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load ' + table });
    }
  });

  router.post('/', async (req, res) => {
    const present = fields.filter((f) => req.body[f.js] !== undefined);
    const missingRequired = fields.filter((f) => f.required && req.body[f.js] === undefined);
    if (missingRequired.length) {
      return res.status(400).json({ error: 'Missing required field(s): ' + missingRequired.map((f) => f.js).join(', ') });
    }
    const cols = present.map((f) => f.sql);
    const placeholders = present.map((_, i) => `$${i + 1}`);
    const values = present.map((f) => req.body[f.js]);
    try {
      const { rows } = await pool.query(
        `insert into ${table} (${cols.join(',')}) values (${placeholders.join(',')}) returning *`,
        values
      );
      res.status(201).json(rowToCamel(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create record in ' + table });
    }
  });

  router.patch('/:id', async (req, res) => {
    const present = fields.filter((f) => req.body[f.js] !== undefined);
    if (present.length === 0) return res.status(400).json({ error: 'No fields to update.' });
    const setClauses = present.map((f, i) => `${f.sql} = $${i + 1}`);
    const values = present.map((f) => req.body[f.js]);
    values.push(req.params.id);
    try {
      const { rows } = await pool.query(
        `update ${table} set ${setClauses.join(',')} where id = $${values.length} returning *`,
        values
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(rowToCamel(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update record in ' + table });
    }
  });

  router.delete('/:id', requireAdmin, async (req, res) => {
    try {
      await pool.query(`delete from ${table} where id = $1`, [req.params.id]);
      res.json({ deleted: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete record in ' + table });
    }
  });

  return router;
}

module.exports = { makeCollectionRouter };
