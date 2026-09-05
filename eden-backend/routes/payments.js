const express = require('express');
const crypto = require('crypto');
const { rowToCamel } = require('../src/middleware');

const PAYSTACK_BASE = 'https://api.paystack.co';

function paymentsRouter(pool) {
  const router = express.Router();

  // Start a Paystack transaction for an order, subscription, or direct provider payment.
  router.post('/initialize', async (req, res) => {
    const { orderId, providerId, subscriptionPlan, email, amount } = req.body; // amount in Naira
    if (!email || !amount) {
      return res.status(400).json({ error: 'email and amount are required' });
    }
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: 'Server is missing PAYSTACK_SECRET_KEY.' });
    }

    try {
      // Calculate split if paying a provider directly
      let commissionAmount = 0;
      let providerPayout = 0;
      if (providerId) {
        const commissionRate = 0.10; // 10% app commission
        commissionAmount = amount * commissionRate;
        providerPayout = amount - commissionAmount;
      }

      const psRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          amount: Math.round(amount * 100), // Paystack expects kobo
          metadata: {
            orderId: orderId || null,
            providerId: providerId || null,
            subscriptionPlan: subscriptionPlan || null,
            commissionAmount,
            providerPayout
          },
          callback_url: req.body.callbackUrl || undefined
        })
      });

      const psData = await psRes.json();
      if (!psRes.ok || !psData.status) {
        console.error('Paystack initialize error', psData);
        return res.status(502).json({ error: 'Could not start payment', detail: psData });
      }

      // Record pending payment in database
      await pool.query(
        `insert into payments (order_id, reference, provider, status, amount)
         values ($1, $2, 'paystack', 'pending', $3)`,
        [orderId || null, psData.data.reference, Math.round(amount)]
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
      const metadata = psData.data?.metadata || {};

      const { rows } = await pool.query('select * from payments where reference=$1', [req.params.reference]);
      const payment = rows[0];

      if (payment) {
        await pool.query('update payments set status=$1, raw=$2 where reference=$3', [
          success ? 'success' : 'failed',
          psData,
          req.params.reference
        ]);

        if (success) {
          // 1. If it's a standard order payment
          if (payment.order_id) {
            await pool.query('update orders set payment_status=$1 where id=$2', ['paid', payment.order_id]);
          }

          // 2. If it's a provider payment (Mechanic, Towing, Dispatch, Parts Seller), credit wallet & log commission
          if (metadata.providerId) {
            const providerPayout = Number(metadata.providerPayout || 0);
            const commissionAmount = Number(metadata.commissionAmount || 0);

            // Update provider wallet balance
            await pool.query(
              'update service_providers set wallet_balance = wallet_balance + $1 where id = $2',
              [providerPayout, metadata.providerId]
            );

            // Log commission record
            await pool.query(
              `insert into commissions (provider_id, total_amount, commission_amount, provider_payout, reference)
               values ($1, $2, $3, $4, $5)`,
              [metadata.providerId, psData.data.amount / 100, commissionAmount, providerPayout, req.params.reference]
            );
          }

          // 3. If it's a user subscription payment
          if (metadata.subscriptionPlan) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30); // 30-day subscription window
            // Assuming metadata contains user identification or email match
            await pool.query(
              `update users set subscription_status = 'active', subscription_expires_at = $1 where email = $2`,
              [expiresAt, psData.data.customer.email]
            );
          }
        }
      }

      res.json({ success, orderId: payment ? payment.order_id : null, data: psData.data });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  // Paystack server-to-server webhook — authoritative source of truth.
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
      const metadata = event.data.metadata || {};

      try {
        const { rows } = await pool.query('select * from payments where reference=$1', [reference]);
        const payment = rows[0];

        if (payment) {
          await pool.query('update payments set status=$1, raw=$2 where reference=$3', ['success', event, reference]);

          if (payment.order_id) {
            await pool.query('update orders set payment_status=$1 where id=$2', ['paid', payment.order_id]);
          }
        }

        // Handle provider payouts & commissions via webhook metadata
        if (metadata.providerId) {
          const providerPayout = Number(metadata.providerPayout || 0);
          const commissionAmount = Number(metadata.commissionAmount || 0);

          await pool.query(
            'update service_providers set wallet_balance = wallet_balance + $1 where id = $2',
            [providerPayout, metadata.providerId]
          );

          await pool.query(
            `insert into commissions (provider_id, total_amount, commission_amount, provider_payout, reference)
             values ($1, $2, $3, $4, $5) on conflict do nothing`,
            [metadata.providerId, event.data.amount / 100, commissionAmount, providerPayout, reference]
          );
        }

        // Handle user subscription activation via webhook
        if (metadata.subscriptionPlan) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          await pool.query(
            `update users set subscription_status = 'active', subscription_expires_at = $1 where email = $2`,
            [expiresAt, event.data.customer.email]
          );
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