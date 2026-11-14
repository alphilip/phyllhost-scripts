// Levels / XP: 15–25 XP per message (configurable), one award per cooldown
// window, level thresholds grow quadratically.
const store = require('./store');

// XP needed to go from `level` to `level + 1`.
function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

// Total XP at which `level` is reached (sum of all thresholds below it).
function totalXpForLevel(level) {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpForLevel(i);
  return total;
}

function levelFromTotalXp(totalXp) {
  let level = 0;
  while (totalXp >= totalXpForLevel(level + 1)) level++;
  return level;
}

const lastAward = new Map(); // `${guildId}:${userId}` -> timestamp ms

function awardXp(guildId, userId, config) {
  const xpCfg = config.xp || {};
  if (xpCfg.enabled === false) return null;
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const cooldownMs = (xpCfg.cooldownSeconds ?? 60) * 1000;
  if (now - (lastAward.get(key) || 0) < cooldownMs) return null;
  lastAward.set(key, now);

  const min = xpCfg.min ?? 15;
  const max = xpCfg.max ?? 25;
  const gained = min + Math.floor(Math.random() * (max - min + 1));
  const entry = store.getXp(guildId, userId);
  entry.xp += gained;
  const newLevel = levelFromTotalXp(entry.xp);
  const leveledUp = newLevel > entry.level;
  entry.level = newLevel;
  store.setXp(guildId, userId, entry);
  return { ...entry, gained, leveledUp };
}

function progressBar(entry, length = 10) {
  const currentFloor = totalXpForLevel(entry.level);
  const nextFloor = totalXpForLevel(entry.level + 1);
  const intoLevel = entry.xp - currentFloor;
  const needed = nextFloor - currentFloor;
  const filled = Math.min(length, Math.round((intoLevel / needed) * length));
  return {
    bar: '▰'.repeat(filled) + '▱'.repeat(length - filled),
    intoLevel,
    needed,
  };
}

module.exports = { xpForLevel, totalXpForLevel, levelFromTotalXp, awardXp, progressBar };
