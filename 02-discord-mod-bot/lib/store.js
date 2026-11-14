// Tiny JSON-file store for warnings, XP and tickets.
// Files live in ./data/ (gitignored) and are created on first use.
// Writes go through a temp file + rename so a crash can't half-write a file.
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function load(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function save(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath(name)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath(name));
}

// ---------------------------------------------------------------------------
// Warnings: { [guildId]: { [userId]: [ { id, reason, moderatorTag, date } ] } }
// ---------------------------------------------------------------------------
function getWarns(guildId, userId) {
  const all = load('warns', {});
  return (all[guildId] && all[guildId][userId]) || [];
}

function addWarn(guildId, userId, warn) {
  const all = load('warns', {});
  all[guildId] = all[guildId] || {};
  all[guildId][userId] = all[guildId][userId] || [];
  const entry = { id: Date.now().toString(36), date: new Date().toISOString(), ...warn };
  all[guildId][userId].push(entry);
  save('warns', all);
  return entry;
}

// Removes one warning by its id (or 1-based list number). Returns the removed entry or null.
function removeWarn(guildId, userId, idOrNumber) {
  const all = load('warns', {});
  const list = (all[guildId] && all[guildId][userId]) || [];
  let index = -1;
  if (/^\d+$/.test(String(idOrNumber))) {
    const n = Number(idOrNumber);
    if (n >= 1 && n <= list.length) index = n - 1;
  } else {
    index = list.findIndex((w) => w.id === String(idOrNumber));
  }
  if (index === -1) return null;
  const [removed] = list.splice(index, 1);
  save('warns', all);
  return removed;
}

// ---------------------------------------------------------------------------
// XP: { [guildId]: { [userId]: { xp, level } } }
// ---------------------------------------------------------------------------
function getXp(guildId, userId) {
  const all = load('xp', {});
  return (all[guildId] && all[guildId][userId]) || { xp: 0, level: 0 };
}

function setXp(guildId, userId, entry) {
  const all = load('xp', {});
  all[guildId] = all[guildId] || {};
  all[guildId][userId] = entry;
  save('xp', all);
}

function getLeaderboard(guildId, limit = 10) {
  const all = load('xp', {});
  const members = all[guildId] || {};
  return Object.entries(members)
    .map(([userId, entry]) => ({ userId, xp: entry.xp, level: entry.level }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Tickets: { [channelId]: { ownerId, guildId, topic, openedAt } }
// ---------------------------------------------------------------------------
function getTicket(channelId) {
  return load('tickets', {})[channelId] || null;
}

function setTicket(channelId, ticket) {
  const all = load('tickets', {});
  all[channelId] = ticket;
  save('tickets', all);
}

function removeTicket(channelId) {
  const all = load('tickets', {});
  delete all[channelId];
  save('tickets', all);
}

// ---------------------------------------------------------------------------
// Guild overrides: runtime settings written by /config, merged over config.json.
// { [guildId]: { logChannelId, verifiedRoleId, welcomeChannelId, ... } }
// ---------------------------------------------------------------------------
function getOverrides(guildId) {
  return load('guild-overrides', {})[guildId] || {};
}

function setOverride(guildId, key, value) {
  const all = load('guild-overrides', {});
  all[guildId] = all[guildId] || {};
  all[guildId][key] = value;
  save('guild-overrides', all);
}

module.exports = {
  load,
  save,
  getWarns,
  addWarn,
  removeWarn,
  getXp,
  setXp,
  getLeaderboard,
  getTicket,
  setTicket,
  removeTicket,
  getOverrides,
  setOverride,
};
