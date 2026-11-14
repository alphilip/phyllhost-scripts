// Idempotency store: data/processed.json
//
// Paystack retries a webhook if it does not get a 200, and it can
// legitimately deliver the same event twice. This store records every
// event we have accepted (by its Paystack id, falling back to the
// payment/transfer reference) so we never process the same event twice.
//
// File format — a JSON array, newest first:
//   [{ "key": "123456789", "event": "charge.success",
//      "reference": "abc123", "receivedAt": "2026-11-13T15:00:00.000Z" }]
//
// The list is capped (default 1000 entries, MAX_PROCESSED env var)
// so the file cannot grow without bound. Writes are atomic
// (write to a temp file, then rename) so a crash mid-write cannot
// leave a half-written store behind.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'processed.json');
const MAX_PROCESSED = Number(process.env.MAX_PROCESSED || 1000);

/**
 * Stable dedupe key for an event. Paystack always sends a numeric
 * `id` for the event; the reference is the fallback for payloads
 * that lack one (e.g. hand-built test payloads).
 */
function keyFor(event) {
  const data = (event && event.data) || {};
  if (event && event.id !== undefined && event.id !== null && event.id !== '') {
    return String(event.id);
  }
  if (data.reference) return String(data.reference);
  if (data.subscription_code) return String(data.subscription_code);
  if (data.invoice_code) return String(data.invoice_code);
  return null; // cannot dedupe safely — caller must treat as new
}

function load() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt store: start fresh rather than refusing all webhooks.
    return [];
  }
}

function save(entries) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2) + '\n');
  fs.renameSync(tmp, STORE_FILE);
}

function has(event) {
  const key = keyFor(event);
  if (!key) return false;
  return load().some((entry) => entry.key === key);
}

/** Record an event as processed. Returns the stored record (or null). */
function add(event) {
  const key = keyFor(event);
  if (!key) return null;
  const entries = load();
  if (entries.some((entry) => entry.key === key)) {
    return entries.find((entry) => entry.key === key);
  }
  const data = (event && event.data) || {};
  const record = {
    key,
    event: event.event || 'unknown',
    reference: data.reference || data.subscription_code || data.invoice_code || null,
    amount: typeof data.amount === 'number' ? data.amount : null,
    currency: data.currency || null,
    customerEmail: (data.customer && data.customer.email) || null,
    receivedAt: new Date().toISOString(),
  };
  entries.unshift(record);
  save(entries.slice(0, MAX_PROCESSED));
  return record;
}

/** Recent processed events, newest first, capped at `limit` (max 100). */
function list(limit) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), 100);
  return load().slice(0, n);
}

function count() {
  return load().length;
}

module.exports = { keyFor, has, add, list, count, load, STORE_FILE };
