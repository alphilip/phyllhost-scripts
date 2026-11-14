// Structured JSON logger.
//
// Every entry is one JSON object on one line, written to
// logs/events.log AND printed to the console, e.g.
//   {"timestamp":"2026-11-13T15:00:00.000Z","level":"info","message":"webhook received","event":"charge.success","reference":"abc123"}
//
// The file is append-only, so a crash never loses earlier lines and
// `tail -f logs/events.log` / `grep` / `jq` all work on it directly.
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'events.log');

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function log(level, message, meta) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta && typeof meta === 'object' ? meta : {}),
  };
  const line = JSON.stringify(entry) + '\n';
  // Console first, so a message is never lost if the disk write fails.
  if (level === 'error') console.error(line.trim());
  else if (level === 'warn') console.warn(line.trim());
  else console.log(line.trim());
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, line);
  } catch (err) {
    // Never crash the webhook because logging failed.
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'failed to write to log file',
      error: err.message,
    }));
  }
}

module.exports = {
  log,
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
  LOG_FILE,
};
