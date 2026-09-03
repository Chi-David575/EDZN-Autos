const express = require('express');
const { rowToCamel, requireAdmin } = require('../src/middleware');

function usersRouter(pool) {
  const router = express.Router();

  // Admin-only: full user list, for the "monitor everything" dashboard.
  router.get('/', requireAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query('select * from users order by created_at desc limit 500');
      res.json(rows.map(rowToCamel));
    } catch (err) {
      res.status(500).json({ error: 'Failed to load users' });
    }
  });

  // Sign up, or return the existing profile if this phone number is already registered.
  router.post('/signup', async (req, res) => {
    const { name, phone, email, lat, lng, locationLabel } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });
    try {
      const existing = await pool.query('select * from users where phone = $1', [phone]);
      if (existing.rows[0]) {
        if (lat != null && lng != null) {
          const { rows } = await pool.query(
            'update users set lat=$1, lng=$2, location_label=$3 where id=$4 returning *',
            [lat, lng, locationLabel || 'GPS location shared', existing.rows[0].id]
          );
          return res.json(rowToCamel(rows[0]));
        }
        return res.json(rowToCamel(existing.rows[0]));
      }
      const { rows } = await pool.query(
        `insert into users (name, phone, email, lat, lng, location_label)
         values ($1,$2,$3,$4,$5,$6) returning *`,
        [name, phone, email || null, lat ?? null, lng ?? null, locationLabel || 'Not shared']
      );
      res.status(201).json(rowToCamel(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Signup failed' });
    }
  });

  router.get('/by-phone/:phone', async (req, res) => {
    try {
      const { rows } = await pool.query('select * from users where phone = $1', [req.params.phone]);
      if (!rows[0]) return res.status(404).json({ error: 'No profile found for that number.' });
      res.json(rowToCamel(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Lookup failed' });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const { rows } = await pool.query('select * from users where id = $1', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(rowToCamel(rows[0]));
    } catch (err) {
      res.status(500).json({ error: 'Lookup failed' });
    }
  });

  // Update location on file — called before/after any emergency request, per
  // the security requirement that every account keep a traceable location.
  router.patch('/:id/location', async (req, res) => {
    const { lat, lng, locationLabel } = req.body;
    try {
      const { rows } = await pool.query(
        'update users set lat=$1, lng=$2, location_label=$3 where id=$4 returning *',
        [lat, lng, locationLabel || 'GPS location shared', req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(rowToCamel(rows[0]));
    } catch (err) {
      res.status(500).json({ error: 'Failed to update location' });
    }
  });

  return router;
}

module.exports = { usersRouter };
