// Guild settings: config.json (defaults + per-guild overrides) merged with
// runtime overrides from /config (data/guild-overrides.json) and .env fallbacks.
// Precedence, highest first: runtime override > config.json guild entry
// > config.json defaults > .env fallback.
const fs = require('node:fs');
const path = require('node:path');
const store = require('./store');

let fileConfig = { defaults: {}, guilds: {} };
try {
  fileConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
} catch (err) {
  console.warn('[config] could not read config.json, using empty defaults:', err.message);
}

const ENV_FALLBACKS = {
  logChannelId: process.env.LOG_CHANNEL_ID || '',
  verifiedRoleName: process.env.VERIFIED_ROLE_NAME || 'Verified',
  ticketCategoryName: process.env.TICKET_CATEGORY_NAME || 'Tickets',
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID || '',
};

function isPlaceholder(value) {
  return typeof value === 'string' && value.startsWith('PASTE_YOUR_');
}

function clean(obj) {
  // Drop placeholder values so they never win over a real setting.
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (isPlaceholder(value)) continue;
    out[key] = value && typeof value === 'object' ? clean(value) : value;
  }
  return out;
}

function mergeDeep(base, override) {
  const out = { ...(base || {}) };
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object') {
      out[key] = mergeDeep(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function getGuildConfig(guildId) {
  const defaults = clean(fileConfig.defaults || {});
  const guildEntry = clean((fileConfig.guilds || {})[guildId] || {});
  const runtime = store.getOverrides(guildId);
  let merged = mergeDeep(defaults, guildEntry);
  merged = mergeDeep(merged, runtime);
  for (const [key, fallback] of Object.entries(ENV_FALLBACKS)) {
    if (!merged[key]) merged[key] = fallback;
  }
  merged.xp = { enabled: true, min: 15, max: 25, cooldownSeconds: 60, ...(merged.xp || {}) };
  merged.automod = {
    enabled: true,
    badWords: [],
    blockInvites: true,
    spam: { enabled: true, maxMessages: 5, windowSeconds: 5, timeoutMinutes: 10 },
    ...(merged.automod || {}),
  };
  merged.automod.spam = { enabled: true, maxMessages: 5, windowSeconds: 5, timeoutMinutes: 10, ...(merged.automod.spam || {}) };
  return merged;
}

function fill(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

module.exports = { getGuildConfig, fill };
