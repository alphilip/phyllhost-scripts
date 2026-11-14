// Tiny timestamped logger used by every module.
// Keeps log lines uniform: [2026-11-13T15:00:00.000Z] [INFO] message
// Job runs add their own [job-name] tag to the message.

function stamp() {
  return new Date().toISOString();
}

function info(message) {
  console.log(`[${stamp()}] [INFO] ${message}`);
}

function warn(message) {
  console.warn(`[${stamp()}] [WARN] ${message}`);
}

function error(message) {
  console.error(`[${stamp()}] [ERROR] ${message}`);
}

module.exports = { info, warn, error };
