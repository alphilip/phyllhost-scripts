// Retry queue for failed deliveries: data/retry-queue.json
//
// When deliverOrder() (or any handler) throws, the event is NOT lost
// and NOT re-processed from scratch — it goes on this queue and is
// retried in the background with exponential backoff:
//
//   attempt 1 → retry after ~1 min, attempt 2 → ~2 min,
//   attempt 3 → ~4 min, ... capped at 60 min between tries.
//   After MAX_ATTEMPTS (default 5) the item is marked `dead` and
//   left in the file for a human to inspect instead of retrying
//   forever.
//
// File format — a JSON array:
//   [{ "key": "123456789", "event": "charge.success",
//      "reference": "abc123", "attempts": 1,
//      "nextRetryAt": "2026-11-13T15:01:00.000Z",
//      "lastError": "...", "status": "pending" | "dead",
//      "payload": { ...full Paystack event... } }]
//
// The queue survives restarts (it is a file, not memory), so a
// redeploy does not drop pending deliveries.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'retry-queue.json');
const MAX_ATTEMPTS = Number(process.env.RETRY_MAX_ATTEMPTS || 5);
const RETRY_INTERVAL_MS = Number(process.env.RETRY_INTERVAL_MS || 60 * 1000);
const BASE_DELAY_MS = 60 * 1000; // 1 minute
const MAX_DELAY_MS = 60 * 60 * 1000; // 1 hour

function load() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(QUEUE_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(items) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = QUEUE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2) + '\n');
  fs.renameSync(tmp, QUEUE_FILE);
}

/** Delay before the next attempt: 1m, 2m, 4m, 8m, 16m … capped at 1h. */
function backoffDelayMs(attempts) {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(attempts - 1, 0), MAX_DELAY_MS);
}

/** Add a failed event to the queue (or bump its attempt count). */
function enqueue(event, error) {
  const items = load();
  const key = String((event && event.id) || ((event.data || {}).reference) || Date.now());
  const existing = items.find((item) => item.key === key && item.status === 'pending');
  const now = new Date();
  if (existing) {
    existing.attempts += 1;
    existing.lastError = error ? error.message : 'unknown error';
    existing.nextRetryAt = new Date(now.getTime() + backoffDelayMs(existing.attempts)).toISOString();
    existing.updatedAt = now.toISOString();
    if (existing.attempts >= MAX_ATTEMPTS) existing.status = 'dead';
  } else {
    items.push({
      key,
      event: event.event || 'unknown',
      reference: (event.data || {}).reference || null,
      attempts: 1,
      nextRetryAt: new Date(now.getTime() + backoffDelayMs(1)).toISOString(),
      lastError: error ? error.message : 'unknown error',
      status: 'pending',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      payload: event,
    });
  }
  save(items);
  return items.find((item) => item.key === key);
}

function list() {
  return load();
}

function pendingCount() {
  return load().filter((item) => item.status === 'pending').length;
}

/**
 * Retry every due pending item once, using `deliver(event)` —
 * the same function the live handler uses. Items that succeed are
 * removed; items that fail again get a longer backoff; items that
 * exhaust MAX_ATTEMPTS are marked `dead`.
 */
async function processQueue(deliver, logger) {
  const now = new Date();
  const items = load();
  let changed = false;
  const remaining = [];
  for (const item of items) {
    if (item.status !== 'pending' || new Date(item.nextRetryAt) > now) {
      remaining.push(item);
      continue;
    }
    changed = true;
    try {
      await deliver(item.payload);
      logger.info('retry succeeded', { event: item.event, reference: item.reference, attempts: item.attempts });
    } catch (err) {
      item.attempts += 1;
      item.lastError = err.message;
      item.updatedAt = new Date().toISOString();
      if (item.attempts >= MAX_ATTEMPTS) {
        item.status = 'dead';
        logger.error('retry exhausted, marked dead', { event: item.event, reference: item.reference, attempts: item.attempts, error: err.message });
      } else {
        item.nextRetryAt = new Date(Date.now() + backoffDelayMs(item.attempts)).toISOString();
        logger.warn('retry failed, will retry later', { event: item.event, reference: item.reference, attempts: item.attempts, nextRetryAt: item.nextRetryAt, error: err.message });
      }
      remaining.push(item);
    }
  }
  if (changed) save(remaining);
  return { processed: items.length - remaining.filter((i) => i.status === 'pending').length, pending: pendingCount() };
}

/** Start the background retry loop. Returns the interval handle. */
function startRetryLoop(deliver, logger) {
  const timer = setInterval(() => {
    processQueue(deliver, logger).catch((err) => {
      logger.error('retry loop error', { error: err.message });
    });
  }, RETRY_INTERVAL_MS);
  timer.unref(); // do not keep the process alive on this timer alone
  return timer;
}

module.exports = {
  enqueue, list, pendingCount, processQueue, startRetryLoop,
  backoffDelayMs, QUEUE_FILE, MAX_ATTEMPTS, RETRY_INTERVAL_MS,
};
