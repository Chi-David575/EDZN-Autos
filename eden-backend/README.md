# EDZN Autos — Backend API

This is the real database + API behind EDZN Autos. It has been tested end-to-end
against a live Postgres instance (signup, mechanic registration, order + receipt
creation, stage advancement, admin auth, Paystack webhook signature verification
all confirmed working).

## What it does

- Stores users, mechanics, parts sellers, dispatch riders, parts, oil products,
  rentals, orders and receipts in Postgres.
- Every order automatically creates a linked receipt with a location snapshot —
  the evidence trail the security feature needs.
- Holds your `ANTHROPIC_API_KEY` and `PAYSTACK_SECRET_KEY` server-side — the
  frontend never sees them.
- Verifies Paystack webhook signatures (HMAC-SHA512) so payment confirmation
  can't be spoofed.
- Gates admin-only actions (viewing all orders/receipts, deleting records)
  behind an `x-admin-password` header.

## 1. Get a database (Supabase — free tier is enough to start)

1. Go to supabase.com → New project.
2. Once it's created, go to **Project Settings → Database → Connection string → URI**.
   Copy it — that's your `DATABASE_URL`.
3. Go to the **SQL Editor** in Supabase, paste the contents of `db/schema.sql`,
   and run it. This creates all the tables.

(Any hosted Postgres works — Railway, Render, Neon are fine alternatives.)

## 2. Configure environment variables

```
cp .env.example .env
```

Fill in:
- `DATABASE_URL` — from step 1
- `ADMIN_PASSWORD` — pick something only you know; this unlocks the admin dashboard
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` — from dashboard.paystack.com
  (start with the `sk_test_...` / `pk_test_...` keys and Paystack's test cards
  until you're confident everything works, then switch to live keys)
- `ALLOWED_ORIGINS` — the URL(s) your frontend will be hosted at

## 3. Run it locally to test

```
npm install
npm run dev
```

Visit `http://localhost:4000/health` — you should see `{"ok":true,...}`.

## 4. Deploy it

Any Node host works. Two easy options:

**Render.com**
1. New → Web Service → connect this repo/folder.
2. Build command: `npm install`. Start command: `npm start`.
3. Add all the `.env` variables under Environment.

**Railway.app**
1. New Project → Deploy from local folder or GitHub repo.
2. Add the same environment variables.
3. Railway gives you a public URL automatically.

Either way, once deployed you'll have a URL like `https://edzn-api.onrender.com`
— that's the `API_BASE` the frontend needs to point at.

## 5. Point Paystack's webhook at your live server

In the Paystack dashboard → Settings → API Keys & Webhooks, set the webhook URL to:

```
https://YOUR-BACKEND-URL/api/payments/webhook
```

## API reference (quick)

| Method | Path | Purpose |
|---|---|---|
| POST | /api/users/signup | Create or fetch a user profile |
| GET | /api/users/by-phone/:phone | Look up a user |
| PATCH | /api/users/:id/location | Update a user's location |
| GET/POST/PATCH/DELETE | /api/mechanics | Mechanics directory |
| GET/POST/PATCH/DELETE | /api/parts-sellers | Parts sellers |
| GET/POST/PATCH/DELETE | /api/dispatch-riders | Dispatch riders |
| GET/POST/PATCH/DELETE | /api/parts | Parts inventory |
| GET/POST/PATCH/DELETE | /api/oil-products | Oil/gear products |
| GET/POST/PATCH/DELETE | /api/rentals | Rental fleet |
| POST | /api/orders | Create an order (+ auto receipt) |
| POST | /api/orders/:id/advance | Move an order to its next stage |
| GET | /api/orders/user/:userId | A user's orders |
| GET | /api/orders (admin) | All orders |
| GET | /api/receipts/user/:userId | A user's receipts |
| GET | /api/receipts (admin) | All receipts |
| POST | /api/ai-doctor | AI Car Doctor chat (key held server-side) |
| POST | /api/payments/initialize | Start a Paystack transaction |
| GET | /api/payments/verify/:reference | Confirm a payment after checkout |
| POST | /api/payments/webhook | Paystack server-to-server confirmation |

Admin-only routes (DELETE endpoints, GET /api/orders, GET /api/receipts)
require header: `x-admin-password: <your ADMIN_PASSWORD>`.

## What's still missing before a real launch

- Real user authentication (this uses phone-number lookup, not passwords/OTP —
  fine for a demo, not for production. Add OTP via Termii or similar for Nigeria).
- Rate limiting / abuse protection on public POST endpoints.
- File/image upload for mechanic and parts-seller profile photos.
- Automated tests and a staging environment before you point Paystack's live keys at it.
