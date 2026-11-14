// Paystack webhook receiver (Express) — entry point.
//
//   POST /webhooks/paystack  — verify signature, dedupe, answer 200 fast,
//                              then run the event handler in the background
//   GET  /health             — { ok: true, ... } liveness check
//   GET  /events             — recent processed events, newest first
//   GET  /retry-queue        — pending / dead retry items
//
// Set your Paystack dashboard webhook URL to:
//   https://<your-domain>/webhooks/paystack
//
// Flow for every webhook:
//   1. Verify the x-paystack-signature header (HMAC-SHA512 over the
//      RAW body, timing-safe compare) — bad signature → 401.
//   2. Dedupe by event id / reference in data/processed.json —
//      duplicate → 200 immediately, handler does NOT run again.
//   3. Record the event, answer 200 immediately (Paystack retries
//      anything slower than a few seconds).
//   4. Dispatch to lib/handlers.js in the background. If the handler
//      throws (e.g. deliverOrder fails), the event goes on the retry
//      queue (data/retry-queue.json) and is retried with backoff.
require('dotenv').config();
const express = require('express');

const { verifySignature } = require('./lib/verify');
const { dispatch, deliverOrder } = require('./lib/handlers');
const store = require('./lib/store');
const retry = require('./lib/retry');
const logger = require('./lib/logger');

const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.PAYSTACK_SECRET_KEY;
const RETRY_INTERVAL_MS = Number(process.env.RETRY_INTERVAL_MS || 60 * 1000);

if (!SECRET || SECRET === 'PASTE_YOUR_PAYSTACK_SECRET_KEY_HERE') {
  console.error('Set PAYSTACK_SECRET_KEY in your .env file first (see .env.example).');
  process.exit(1);
}

const app = express();

// Keep the raw body so the signature can be verified against exactly
// what Paystack sent. express.json parses it afterwards as usual.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

// Malformed JSON → 400 (Paystack always sends valid JSON).
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.warn('rejected: malformed JSON body', { error: err.message });
    return res.status(400).json({ ok: false, error: 'malformed JSON' });
  }
  return next(err);
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'paystack-webhook',
    uptimeSeconds: Math.round(process.uptime()),
    processedEvents: store.count(),
    pendingRetries: retry.pendingCount(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'paystack-webhook',
    webhook: 'POST /webhooks/paystack',
    health: 'GET /health',
    events: 'GET /events?limit=50',
    retryQueue: 'GET /retry-queue',
  });
});

// Recent processed events, newest first. ?limit=50 (default 50, max 100).
app.get('/events', (req, res) => {
  res.json({ ok: true, count: store.list(req.query.limit).length, events: store.list(req.query.limit) });
});

// Current retry queue (pending + dead items).
app.get('/retry-queue', (req, res) => {
  const items = retry.list();
  res.json({ ok: true, pending: retry.pendingCount(), count: items.length, items });
});

app.post('/webhooks/paystack', (req, res) => {
  // 1. Signature check — on the RAW body, before trusting anything.
  if (!verifySignature(SECRET, req.rawBody, req.headers['x-paystack-signature'])) {
    logger.warn('webhook rejected: bad signature', { ip: req.ip || null });
    return res.status(401).json({ ok: false, error: 'bad signature' });
  }

  const event = req.body || {};
  if (!event.event || typeof event.event !== 'string') {
    logger.warn('webhook rejected: missing event type', {});
    return res.status(400).json({ ok: false, error: 'missing event type' });
  }

  // 2. Idempotency — never process the same event twice.
  if (store.has(event)) {
    logger.info('duplicate event ignored', {
      event: event.event,
      id: event.id || null,
      reference: (event.data && event.data.reference) || null,
    });
    return res.status(200).json({ ok: true, duplicate: true });
  }

  // 3. Record first, then answer fast — the handler runs afterwards.
  const record = store.add(event);
  logger.info('webhook received', {
    event: event.event,
    id: event.id || null,
    reference: (event.data && event.data.reference) || null,
  });
  res.status(200).json({ ok: true, id: record ? record.key : null });

  // 4. Heavy work AFTER responding, so Paystack never times out.
  //    A thrown handler error goes to the retry queue, not to the client.
  dispatch(event, logger).catch((err) => {
    logger.error('handler failed, queued for retry', {
      event: event.event,
      reference: (event.data && event.data.reference) || null,
      error: err.message,
    });
    try {
      retry.enqueue(event, err);
    } catch (queueErr) {
      logger.error('failed to enqueue retry', { error: queueErr.message });
    }
  });
});

// Background retry loop: retries failed deliveries with backoff.
// The retry worker reuses deliverOrder() for charge.success events
// and re-dispatches other event types through their handlers.
const retryTimer = retry.startRetryLoop(async (event) => {
  if (event.event === 'charge.success') {
    await deliverOrder(event);
  } else {
    await dispatch(event, logger);
  }
}, logger);

const server = app.listen(PORT, () => {
  logger.info('paystack webhook listening', {
    port: PORT,
    webhook: '/webhooks/paystack',
    retryIntervalMs: RETRY_INTERVAL_MS,
  });
});

function shutdown(signal) {
  logger.info('shutting down', { signal });
  clearInterval(retryTimer);
  server.close(() => process.exit(0));
  // Force out if connections hang.
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
