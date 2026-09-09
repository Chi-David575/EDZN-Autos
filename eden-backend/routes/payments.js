const express = require('express');
const crypto = require('crypto');
const { rowToCamel } = require('../src/middleware');
const { authenticateToken } = require('../src/auth');

const PAYSTACK_BASE = 'https://api.paystack.co';
const MAX_AMOUNT_NAIRA = 5_000_000;

function signaturesMatch(signature, expected) {
  const a = Buffer.from(String(signature || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function applySuccessfulCharge(pool, { reference, metadata, amountNaira, email, raw, orderId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let paymentRes = await client.query(
      `update payments set status='success', raw=$2
       where reference=$1 and status is distinct from 'success'
       returning *`,
      [reference, raw]
    );

    if (paymentRes.rows.length === 0) {
      const existing = await client.query('select * from payments where reference=$1', [reference]);
      if (existing.rows[0]) {
        await client.query('COMMIT');
        return existing.rows[0];
      }
      paymentRes = await client.query(
        `insert into payments (order_id, reference, provider, status, amount, raw)
         values ($1, $2, 'paystack', 'success', $3, $4)
         on conflict (reference) do nothing
         returning *`,
        [orderId || null, reference, Math.round(amountNaira || 0), raw]
      );
      if (paymentRes.rows.length === 0) {
        await client.query('COMMIT');
        const again = await client.query('select * from payments where reference=$1', [reference]);
        return again.rows[0] || null;
      }
    }

    const payment = paymentRes.rows[0];

    if (payment.order_id) {
      await client.query('update orders set payment_status=$1 where id=$2', ['paid', payment.order_id]);
    }

    if (metadata.providerId) {
      const providerPayout = Number(metadata.providerPayout || 0);
      const commissionAmount = Number(metadata.commissionAmount || 0);
      const ins = await client.query(
        `insert into commissions (provider_id, total_amount, commission_amount, provider_payout, reference)
         values ($1, $2, $3, $4, $5)
         on conflict (reference) do nothing
         returning id`,
        [metadata.providerId, amountNaira, commissionAmount, providerPayout, reference]
      );
      if (ins.rows[0] && providerPayout > 0) {
        await client.query(
          'update service_providers set wallet_balance = wallet_balance + $1 where id = $2',
          [providerPayout, metadata.providerId]
        );
      }
    }

    if (metadata.subscriptionPlan && email) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      await client.query(
        `update users set subscription_status = 'active', subscription_expires_at = $1 where email = $2`,
        [expiresAt, email]
      );
    }

    await client.query('COMMIT');
    return payment;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function paymentsRouter(pool) {
  const router = express.Router();

  router.post('/initialize', authenticateToken, async (req, res) => {
    const { orderId, providerId, subscriptionPlan, email, amount } = req.body;
    if (!email || amount == null) {
      return res.status(400).json({ error: 'email and amount are required' });
    }
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: 'Server is missing PAYSTACK_SECRET_KEY.' });
    }

    let chargeAmount = Number(amount);
    if (!Number.isFinite(chargeAmount) || chargeAmount <= 0 || chargeAmount > MAX_AMOUNT_NAIRA) {
      return res.status(400).json({ error: 'Invalid payment amount.' });
    }

    try {
      if (orderId) {
        const { rows } = await pool.query('select * from orders where id=$1', [orderId]);
        const order = rows[0];
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.user_id && String(order.user_id) !== String(req.user.userId)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        chargeAmount = Number(order.amount);
      }

      let commissionAmount = 0;
      let providerPayout = 0;
      if (providerId) {
        const commissionRate = 0.1;
        commissionAmount = Math.round(chargeAmount * commissionRate * 100) / 100;
        providerPayout = chargeAmount - commissionAmount;
      }

      const psRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          amount: Math.round(chargeAmount * 100),
          metadata: {
            orderId: orderId || null,
            providerId: providerId || null,
            subscriptionPlan: subscriptionPlan || null,
            userId: req.user.userId,
            commissionAmount,
            providerPayout
          },
          callback_url: req.body.callbackUrl || undefined
        })
      });

      const psData = await psRes.json();
      if (!psRes.ok || !psData.status) {
        console.error('Paystack initialize error', psData);
        return res.status(502).json({ error: 'Could not start payment' });
      }

      await pool.query(
        `insert into payments (order_id, reference, provider, status, amount)
         values ($1, $2, 'paystack', 'pending', $3)`,
        [orderId || null, psData.data.reference, Math.round(chargeAmount)]
      );

      res.json({ authorizationUrl: psData.data.authorization_url, reference: psData.data.reference });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Payment initialization failed' });
    }
  });

  router.get('/verify/:reference', authenticateToken, async (req, res) => {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: 'Server is missing PAYSTACK_SECRET_KEY.' });
    }
    try {
      const psRes = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(req.params.reference)}`, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      });
      const psData = await psRes.json();
      const success = psRes.ok && psData.status && psData.data.status === 'success';
      const metadata = psData.data?.metadata || {};
      const paidEmail = psData.data?.customer?.email;

      let payment;
      if (success) {
        payment = await applySuccessfulCharge(pool, {
          reference: req.params.reference,
          metadata,
          amountNaira: (psData.data.amount || 0) / 100,
          email: paidEmail,
          raw: psData,
          orderId: metadata.orderId || null
        });
      } else {
        const { rows } = await pool.query('select * from payments where reference=$1', [req.params.reference]);
        payment = rows[0];
        if (payment && payment.status === 'pending') {
          await pool.query('update payments set status=$1, raw=$2 where reference=$3 and status=$4', [
            'failed',
            psData,
            req.params.reference,
            'pending'
          ]);
        }
      }

      res.json({ success, orderId: payment ? payment.order_id : null });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  router.post('/webhook', async (req, res) => {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).send('Webhook is not configured');
    }
    const signature = req.header('x-paystack-signature');
    const expected = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(req.body)
      .digest('hex');

    if (!signaturesMatch(signature, expected)) {
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
      const metadata = event.data.metadata || {};
      try {
        await applySuccessfulCharge(pool, {
          reference,
          metadata,
          amountNaira: (event.data.amount || 0) / 100,
          email: event.data.customer?.email,
          raw: event,
          orderId: metadata.orderId || null
        });
      } catch (err) {
        console.error('Webhook processing error', err);
        return res.status(500).send('Processing failed');
      }
    }

    res.sendStatus(200);
  });

  router.get('/order/:orderId', authenticateToken, async (req, res) => {
    const { rows: orderRows } = await pool.query('select user_id from orders where id=$1', [req.params.orderId]);
    if (!orderRows[0]) return res.status(404).json({ error: 'Not found' });
    if (orderRows[0].user_id && String(orderRows[0].user_id) !== String(req.user.userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { rows } = await pool.query('select * from payments where order_id=$1 order by created_at desc', [
      req.params.orderId
    ]);
    res.json(rows.map(rowToCamel));
  });

  return router;
}

module.exports = { paymentsRouter };
