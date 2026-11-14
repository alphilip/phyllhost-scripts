// Price history log — data/history.json.
// Every check appends one entry per target:
//   { timestamp, target, price, inStock }
// The log is capped at MAX_HISTORY_ENTRIES entries per target (default
// 500) so the file never grows without bound. Writes are atomic-ish:
// write to a temp file, then rename over the real one.
'use strict';

const fs = require('fs');
const path = require('path');

function historyPath(dataDir) {
  return path.join(dataDir, 'history.json');
}

function loadHistory(dataDir) {
  const file = historyPath(dataDir);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[history] could not read ${file}: ${err.message} — starting fresh`);
    }
    return [];
  }
}

function saveHistory(dataDir, entries) {
  const file = historyPath(dataDir);
  const tmp = `${file}.tmp`;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * Append one check result and cap the log per target.
 * @returns {object} the entry that was appended
 */
function appendEntry(dataDir, maxEntries, { target, price, inStock }) {
  const entries = loadHistory(dataDir);
  const entry = {
    timestamp: new Date().toISOString(),
    target,
    price,
    inStock,
  };
  entries.push(entry);

  // Keep only the newest `maxEntries` entries per target.
  const counts = {};
  const kept = [];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    counts[e.target] = (counts[e.target] || 0) + 1;
    if (counts[e.target] <= maxEntries) kept.unshift(e);
  }

  saveHistory(dataDir, kept);
  return entry;
}

/** Last logged entry for a target, or null. */
function lastEntryFor(dataDir, targetName) {
  const entries = loadHistory(dataDir);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].target === targetName) return entries[i];
  }
  return null;
}

module.exports = { appendEntry, lastEntryFor, loadHistory };
