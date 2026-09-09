const express = require('express');
const bcrypt = require('bcrypt');
const { rowToCamel, requireAdmin } = require('../src/middleware');

const SENSITIVE_SQL = new Set(['password', 'password_hash', 'otp_code', 'otp_expires_at']);
const ADMIN_ONLY_SQL = new Set(['rating', 'verified', 'user_id']);

function makeCollectionRouter(pool, cfg) {
  const router = express.Router();
  const { table, fields, orderBy = 'created_at desc', openCreate = false } = cfg;
  const publicSql = fields.filter((f) => !SENSITIVE_SQL.has(f.sql)).map((f) => f.sql);
  const selectCols = publicSql.length ? publicSql.join(', ') : '*';

  router.get('/', async (req, res) => {
    try {
      const { rows } = await pool.query(`select ${selectCols} from ${table} order by ${orderBy}`);
      res.json(rows.map(rowToCamel));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load ' + table });
    }
  });

  router.post('/', ...(openCreate ? [] : [requireAdmin]), async (req, res) => {
    const present = fields.filter((f) => req.body[f.js] !== undefined);
    const missingRequired = fields.filter((f) => f.required && req.body[f.js] === undefined);
    if (missingRequired.length) {
      return res.status(400).json({ error: 'Missing required field(s): ' + missingRequired.map((f) => f.js).join(', ') });
    }

    const allowed = present.filter((f) => {
      if (ADMIN_ONLY_SQL.has(f.sql) && !req.header('x-admin-password')) return false;
      return true;
    });

    const cols = allowed.map((f) => f.sql);
    const placeholders = allowed.map((_, i) => `$${i + 1}`);
    const values = [];
    for (const f of allowed) {
      let value = req.body[f.js];
      if (f.sql === 'password' || f.sql === 'password_hash') {
        value = await bcrypt.hash(String(value), 10);
      }
      values.push(value);
    }
    try {
      const { rows } = await pool.query(
        `insert into ${table} (${cols.join(',')}) values (${placeholders.join(',')}) returning ${selectCols}`,
        values
      );
      res.status(201).json(rowToCamel(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create record in ' + table });
    }
  });

  router.patch('/:id', requireAdmin, async (req, res) => {
    const present = fields.filter((f) => req.body[f.js] !== undefined);
    if (present.length === 0) return res.status(400).json({ error: 'No fields to update.' });
    const setClauses = present.map((f, i) => `${f.sql} = $${i + 1}`);
    const values = [];
    for (const f of present) {
      let value = req.body[f.js];
      if (f.sql === 'password' || f.sql === 'password_hash') {
        value = await bcrypt.hash(String(value), 10);
      }
      values.push(value);
    }
    values.push(req.params.id);
    try {
      const { rows } = await pool.query(
        `update ${table} set ${setClauses.join(',')} where id = $${values.length} returning ${selectCols}`,
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
