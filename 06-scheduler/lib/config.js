// Central configuration, read once from environment variables (.env + shell).
// No secrets live here — values come from the environment only.
// See .env.example for every supported variable.
require('dotenv').config();
const path = require('path');

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const timezone = process.env.TZ || process.env.TIMEZONE || 'Africa/Accra';

// Fail fast on a bad timezone: a typo here would silently shift every job,
// so check it once at startup instead of failing inside node-cron later.
try {
  new Intl.DateTimeFormat('en-US', { timeZone: timezone });
} catch (err) {
  console.error(`[ERROR] Invalid timezone "${timezone}" (TZ/TIMEZONE): ${err.message}`);
  process.exit(1);
}

const config = {
  // Timezone applied to every cron schedule (node-cron `timezone` option).
  timezone,

  // Default webhook URL for webhook jobs that don't set their own `url`.
  defaultWebhookUrl: process.env.WEBHOOK_URL || '',

  // Optional status server. Unset/empty/0 = disabled, anything else = port.
  statusPort: toInt(process.env.STATUS_PORT, 0),

  // Retries: how many times a failed job is retried (per-job `retries` wins).
  defaultRetries: Math.max(0, toInt(process.env.DEFAULT_RETRIES, 3)),
  // Delay between retry attempts in ms (per-job `retryDelayMs` wins).
  retryDelayMs: Math.max(0, toInt(process.env.RETRY_DELAY_MS, 5000)),

  // Shell jobs: hard kill after this long (per-job `shellTimeoutMs` wins).
  shellTimeoutMs: Math.max(1000, toInt(process.env.SHELL_TIMEOUT_MS, 30000)),

  // Run history: data/history.json is trimmed to this many entries.
  historyMaxEntries: Math.max(10, toInt(process.env.HISTORY_MAX_ENTRIES, 500)),

  // Paths (relative to the project root, i.e. the folder holding index.js).
  rootDir: path.join(__dirname, '..'),
  jobsFile: path.join(__dirname, '..', 'jobs.json'),
  historyFile: path.join(__dirname, '..', 'data', 'history.json'),
};

module.exports = config;
