# Paystack Webhook Handler

An Express server that receives Paystack webhooks, verifies the
signature, answers fast, and runs your delivery step in the
background — with idempotency (never process the same event twice),
structured JSON logging, and a retry queue for failed deliveries.

## What it does

- `POST /webhooks/paystack` — verifies the `x-paystack-signature`
  header (HMAC-SHA512 over the **raw** request body, timing-safe
  compare) and rejects bad signatures with `401`.
- **Answers 200 immediately**, then runs the handler in the
  background, so Paystack never retries because your delivery step
  was slow.
- **Idempotency** — every accepted event is recorded in
  `data/processed.json` (keyed by Paystack event `id`, falling back
  to the payment reference). A repeat delivery returns `200` with
  `{ "duplicate": true }` and the handler does not run again.
- **Structured logging** — every event is logged as one JSON object
  per line in `logs/events.log` and to the console.
- **Retry queue** — if a handler throws (e.g. `deliverOrder()`
  fails), the event goes into `data/retry-queue.json` and is retried
  in the background with exponential backoff (1m, 2m, 4m, 8m, 16m …
  capped at 1 hour, 5 attempts by default, then marked `dead`).
- `GET /health` — `{ "ok": true, ... }` plus uptime, processed-event
  count and pending-retry count.
- `GET /events?limit=50` — recent processed events, newest first
  (default 50, max 100).
- `GET /retry-queue` — pending and dead retry items.

## Events handled

All handlers live in `lib/handlers.js`. Each one logs the event and
performs the action that event calls for:

| Event | What the handler does |
|---|---|
| `charge.success` | Calls `deliverOrder()` — the clearly-marked placeholder in `lib/handlers.js`. Replace it with your real delivery step (update an order, email/send the product, call another API). |
| `subscription.create` | Logs the subscription code, plan and next payment date. Real step: store the subscription code against the customer. |
| `subscription.disable` | Logs it. Real step: mark the subscription cancelled and stop the paid benefit at the end of the paid period. |
| `subscription.not_renew` | Logs it. Real step: flag as non-renewing; optionally email a win-back / update-card reminder. |
| `transfer.success` | Logs the transfer code, recipient and amount. Real step: mark the payout complete in your ledger. |
| `transfer.failed` | Logs a warning with the reason. Real step: alert the admin and re-queue the payout. |
| `invoice.create` | Logs the invoice code, amount and due date. Real step: record the invoice so later updates match it. |
| `invoice.update` | Logs the new status / paid flag. Real step: if `paid` is true, treat the invoice as settled (`charge.success` remains the authoritative payment event). |

Any other event type is logged as `unhandled event type` and still
returns `200` — unknown events are not an error.

## Project layout

```
04-paystack-webhook/
├── index.js                  # Entry point: Express app, routes, fast-200 flow
├── package.json              # express, dotenv
├── .env.example              # Placeholders ONLY — copy to .env and fill in
├── .gitignore                # node_modules/, .env (never commit a real key)
├── lib/
│   ├── verify.js             # HMAC-SHA512 verification, timing-safe compare
│   ├── handlers.js           # One handler per event + deliverOrder() placeholder
│   ├── store.js              # Idempotency store (data/processed.json)
│   ├── retry.js              # Retry queue + backoff + background loop
│   └── logger.js             # Structured JSON logging (logs/events.log + console)
├── data/
│   ├── processed.json        # Accepted events (idempotency store)
│   └── retry-queue.json      # Failed deliveries awaiting retry
└── logs/
    └── events.log            # One JSON object per line
```

## Setup

### 1. Paystack dashboard — webhook URL

1. Log in to the [Paystack dashboard](https://dashboard.paystack.com).
2. Go to **Settings → API Keys & Webhooks**.
3. Copy your **secret key**. Use the **test** key while testing,
   the **live** key in production.
4. In the **Webhook URL** field, enter your public URL:
   ```
   https://<your-domain>/webhooks/paystack
   ```
   It must be `https://` and publicly reachable — Paystack cannot
   call `localhost`. For local testing, expose your machine with a
   tunnel (e.g. `ngrok http 3000`) and use the tunnel URL.
5. Save. Paystack will now POST every event to that URL.
   (You can also tick individual events in the dashboard; leaving
   all on is fine — unknown types are logged and ignored.)

### 2. Install and configure

```bash
npm install
cp .env.example .env
```

Edit `.env` and set your real key:

```
PAYSTACK_SECRET_KEY=<your-test-secret-key>   # your TEST key first; LIVE key only in production
PORT=3000
```

Optional tuning (defaults shown in `.env.example`):

```
RETRY_INTERVAL_MS=60000   # how often the retry loop runs
RETRY_MAX_ATTEMPTS=5      # attempts before an item is marked "dead"
MAX_PROCESSED=1000        # events kept in data/processed.json
```

## Run

```bash
node index.js
# or
npm start
```

Check it is alive:

```bash
curl http://localhost:3000/health
# {"ok":true,"service":"paystack-webhook","uptimeSeconds":...,"processedEvents":0,"pendingRetries":0,"timestamp":"..."}
```

### With pm2 (keeps it running 24/7, restarts on crash)

```bash
npm install -g pm2
pm2 start index.js --name paystack-webhook
pm2 save
pm2 logs paystack-webhook
```

Useful pm2 commands: `pm2 restart paystack-webhook`,
`pm2 stop paystack-webhook`, `pm2 status`.

## How to test

### 1. Health and event list

```bash
curl http://localhost:3000/health
curl http://localhost:3000/events
curl http://localhost:3000/retry-queue
```

### 2. Send a sample webhook (signed, like Paystack sends it)

Save this as `test-payload.json` (do not commit it):

```json
{
  "event": "charge.success",
  "id": 123456789,
  "data": {
    "id": 987654321,
    "reference": "TEST_REF_001",
    "amount": 5000,
    "currency": "GHS",
    "status": "success",
    "customer": { "email": "buyer@example.com" }
  }
}
```

Then sign it with your secret key and POST it — this Node
one-liner computes the same HMAC-SHA512 Paystack sends:

```bash
node -e "
const fs = require('fs'), crypto = require('crypto');
const body = fs.readFileSync('test-payload.json');
const sig = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex');
fetch('http://localhost:3000/webhooks/paystack', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig },
  body
}).then(r => r.text().then(t => console.log(r.status, t)));
"
```

You need `PAYSTACK_SECRET_KEY` set in that shell (e.g.
`PAYSTACK_SECRET_KEY=<your-test-secret-key> node -e ...`). Expected output:
`200 {"ok":true,"id":"123456789"}` and a `charge.success` /
`order delivered` line in `logs/events.log`.

Check the checks that prove the safety features work:

- **Duplicate:** send the exact same payload again — you get
  `200 {"ok":true,"duplicate":true}` and no second delivery log.
- **Bad signature:** send it with a wrong or missing
  `x-paystack-signature` header — you get `401 {"ok":false,"error":"bad signature"}`.
- **Retry queue:** send a payload with
  `"metadata": { "simulate_delivery_failure": "true" }` inside
  `data` — `deliverOrder()` throws, the event lands in
  `data/retry-queue.json`, and `GET /retry-queue` shows it pending.
  (That test hook exists only to exercise the queue; remove it when
  you wire in the real delivery step.)
- **Other events:** change `"event"` to `subscription.create`,
  `transfer.failed`, `invoice.update`, etc. (and give each a
  different `"id"`) and confirm the matching handler log appears.

### 3. Test from the Paystack dashboard

In **Settings → API Keys & Webhooks** there is a test area to send
a test webhook, or simply make a real test payment with a test card
(`4084 0840 8408 4081`, any future expiry, any CVV). Watch
`logs/events.log` for the `charge.success` line, then confirm
`GET /events` lists it.

## Deploy notes

- **Pterodactyl:** upload these files into a Node.js server's root,
  set `PAYSTACK_SECRET_KEY` (and `PORT` if needed) in the Startup
  tab / environment variables, and give the server an allocation
  (port) Paystack can reach. The server must be reachable on a
  public domain — point the Paystack webhook URL at
  `https://<your-domain>/webhooks/paystack`. `data/` and `logs/`
  live inside the server files, so they survive restarts but not a
  server reinstall — back them up if the retry queue matters to you.
- **Coolify:** deploy as a Node.js app (build: `npm install`,
  start: `npm start`), set the env vars in the app's Environment
  Variables, and attach your domain so the webhook URL is public.
  Note: Coolify redeploys replace the container filesystem, so
  `data/processed.json` and `data/retry-queue.json` reset on each
  deploy — for production use, swap `lib/store.js` / `lib/retry.js`
  for a database-backed store (the function signatures are the same:
  `has/add/list` and `enqueue/list/processQueue`).
- **General:** never commit `.env` or a real secret key. Rotate a
  key immediately if it is ever pasted into chat, a screenshot, or a
  public repo. Use the test key until a test payment delivers
  end-to-end, then switch to the live key.

## Going live — the one thing to change

Replace `deliverOrder()` in `lib/handlers.js` with your real
delivery step. Everything else (verification, dedupe, logging,
retry) is ready as-is.
