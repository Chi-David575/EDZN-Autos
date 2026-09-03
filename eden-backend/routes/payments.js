const express = require('express');
const crypto = require('crypto');
const { rowToCamel } = require('../src/middleware');

const PAYSTACK_BASE = 'https://api.paystack.co';

function paymentsRouter(pool) {
  const router = express.Router();

  // Start a Paystack transaction for an order. Returns the checkout URL the
  // frontend should redirect the user to.
  router.post('/initialize', async (req, res) => {
    const { orderId, email, amount } = req.body; // amount in Naira
    if (!orderId || !email || !amount) {
      return res.status(400).json({ error: 'orderId, email and amount are required' });
    }
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: 'Server is missing PAYSTACK_SECRET_KEY.' });
    }
    try {
      const psRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          amount: Math.round(amount * 100), // Paystack expects kobo
          metadata: { orderId },
          callback_url: req.body.callbackUrl || undefined
        })
      });
      const psData = await psRes.json();
      if (!psRes.ok || !psData.status) {
        console.error('Paystack initialize error', psData);
        return res.status(502).json({ error: 'Could not start payment', detail: psData });
      }
      await pool.query(
        `insert into payments (order_id, reference, provider, status, amount)
         values ($1,$2,'paystack','pending',$3)`,
        [orderId, psData.data.reference, Math.round(amount)]
      );
      res.json({ authorizationUrl: psData.data.authorization_url, reference: psData.data.reference });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Payment initialization failed' });
    }
  });

  // Called by the frontend on the Paystack callback redirect to confirm status.
  router.get('/verify/:reference', async (req, res) => {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: 'Server is missing PAYSTACK_SECRET_KEY.' });
    }
    try {
      const psRes = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(req.params.reference)}`, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      });
      const psData = await psRes.json();
      const success = psRes.ok && psData.status && psData.data.status === 'success';
      const { rows } = await pool.query('select * from payments where reference=$1', [req.params.reference]);
      const payment = rows[0];
      if (payment) {
        await pool.query('update payments set status=$1, raw=$2 where reference=$3', [
          success ? 'success' : 'failed',
          psData,
          req.params.reference
        ]);
        if (success) {
          await pool.query('update orders set payment_status=$1 where id=$2', ['paid', payment.order_id]);
        }
      }
      res.json({ success, orderId: payment ? payment.order_id : null, data: psData.data });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  // Paystack server-to-server webhook — the authoritative source of truth,
  // since it doesn't depend on the customer's browser making it back to /verify.
  // Mounted with express.raw() in server.js so we can check the raw signature.
  router.post('/webhook', async (req, res) => {
    const signature = req.header('x-paystack-signature');
    const expected = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY || '')
      .update(req.body) // raw Buffer
      .digest('hex');
    if (signature !== expected) {
      return res.status(401).send('Invalid signature');
    }
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Bad payload');
    }
    if (event.event === 'charge.success') {
      const reference = event.data.reference;
      try {
        const { rows } = await pool.query('select * from payments where reference=$1', [reference]);
        const payment = rows[0];
        if (payment) {
          await pool.query('update payments set status=$1, raw=$2 where reference=$3', ['success', event, reference]);
          await pool.query('update orders set payment_status=$1 where id=$2', ['paid', payment.order_id]);
        }
      } catch (err) {
        console.error('Webhook processing error', err);
      }
    }
    res.sendStatus(200);
  });

  router.get('/order/:orderId', async (req, res) => {
    const { rows } = await pool.query('select * from payments where order_id=$1 order by created_at desc', [req.params.orderId]);
    res.json(rows.map(rowToCamel));
  });

  return router;
}

module.exports = { paymentsRouter };
