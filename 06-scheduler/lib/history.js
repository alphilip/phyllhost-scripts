// Run-history log: every completed job run is appended to data/history.json
// as { timestamp, job, type, status, attempts, durationMs, output, error }.
// The file is capped at HISTORY_MAX_ENTRIES (default 500) — oldest entries
// are dropped so the file never grows without bound. Writes are atomic
// (temp file + rename) so a crash mid-write cannot corrupt the log.
// A missing or corrupt history file starts fresh with a warning, never a crash.
const fs = require('fs');
const path = require('path');
const { warn } = require('./logger');

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function readHistory(historyFile) {
  try {
    const raw = fs.readFileSync(historyFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code !== 'ENOENT') {
      warn(`history file ${historyFile} is unreadable (${err.message}) — starting a fresh log`);
    }
    return [];
  }
}

function appendRun(historyFile, maxEntries, entry) {
  ensureDir(historyFile);
  const entries = readHistory(historyFile);
  entries.push(entry);
  const trimmed = entries.slice(-maxEntries);
  const tmpFile = `${historyFile}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(trimmed, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpFile, historyFile);
  return trimmed;
}

// Last run per job name, for the /jobs status endpoint.
function getLastRunByJob(historyFile) {
  const byJob = {};
  for (const entry of readHistory(historyFile)) {
    byJob[entry.job] = entry;
  }
  return byJob;
}

function getRecent(historyFile, limit = 20) {
  return readHistory(historyFile).slice(-limit).reverse();
}

module.exports = { appendRun, getLastRunByJob, getRecent, readHistory };
