// config.js — all settings come from environment variables.
// No secrets live here; copy .env.example to .env and fill in your own values.
require('dotenv').config();

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

const config = {
  // Owner's WhatsApp number, international format, digits only (e.g. 233XXXXXXXXX).
  ownerNumber: (process.env.OWNER_NUMBER || '').replace(/\D/g, ''),
  botName: process.env.BOT_NAME || 'MyBot',
  prefix: process.env.PREFIX || '.',

  // Pairing: set PAIRING_CODE=true and PAIRING_NUMBER to your bot number
  // to pair with an 8-digit code instead of scanning a QR code.
  pairingCode: bool(process.env.PAIRING_CODE, false),
  pairingNumber: (process.env.PAIRING_NUMBER || '').replace(/\D/g, ''),

  // Paced send queue (see lib/queue.js).
  queue: {
    minDelayMs: num(process.env.QUEUE_MIN_DELAY_MS, 4000),
    maxDelayMs: num(process.env.QUEUE_MAX_DELAY_MS, 12000),
    dailyCap: num(process.env.DAILY_SEND_CAP, 150),
    // Quiet hours: the queue pauses overnight and resumes in the morning.
    // Set QUIET_HOURS=false to disable.
    quietHours: bool(process.env.QUIET_HOURS, true),
    quietStartHour: num(process.env.QUIET_START_HOUR, 22), // 22:00
    quietEndHour: num(process.env.QUIET_END_HOUR, 7) // 07:00
  },

  // Moderation defaults (per-group settings can override these).
  moderation: {
    warnLimit: num(process.env.WARN_LIMIT, 3),
    antiLink: bool(process.env.ANTILINK_DEFAULT, false),
    welcome: bool(process.env.WELCOME_DEFAULT, false),
    // Anti-spam: more than this many messages inside the window triggers a warn.
    spamMaxMessages: num(process.env.SPAM_MAX_MESSAGES, 6),
    spamWindowMs: num(process.env.SPAM_WINDOW_MS, 10000)
  },

  // Downloaders: maximum file size the bot will send (bytes). Default ~50 MB.
  maxDownloadBytes: num(process.env.MAX_DOWNLOAD_MB, 50) * 1024 * 1024,

  // AI providers, tried in order. Leave a key empty to skip that provider.
  // The free fallback needs no key at all.
  ai: {
    groqApiKey: process.env.GROQ_API_KEY || '',
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  },

  // Default keyword auto-replies (owner can add more at runtime with .addreply).
  // These fire only when someone messages the bot first.
  autoReplies: {
    'opening hours': 'We are open Monday to Saturday, 8:00 - 18:00.',
    'price list': 'Send us what you need and we will share the price list.',
    'talk to a human': 'A human will reply to you shortly. Thank you for your patience.'
  },

  sessionDir: process.env.SESSION_DIR || 'session',
  dataDir: process.env.DATA_DIR || 'data',
  tmpDir: process.env.TMP_DIR || 'tmp'
};

module.exports = config;
