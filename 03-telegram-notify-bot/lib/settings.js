// Per-chat alert levels.
//
// Alert levels: "info" and "important".
// Chat setting (what a chat wants to receive):
//   "all"       — every alert (default for new subscribers)
//   "info"      — info-level alerts only
//   "important" — important-level alerts only
// A chat with no stored setting behaves as "all".
const LEVELS = ['all', 'info', 'important'];
const ALERT_LEVELS = ['info', 'important'];

const DESCRIPTIONS = {
  all: 'All alerts (info + important)',
  info: 'Info alerts only',
  important: 'Important alerts only',
};

function isValidLevel(value) {
  return LEVELS.includes(value);
}

function isValidAlertLevel(value) {
  return ALERT_LEVELS.includes(value);
}

function describeLevel(level) {
  return DESCRIPTIONS[level] || DESCRIPTIONS.all;
}

// Does a chat set to `chatLevel` want an alert of `alertLevel`?
function levelMatches(chatLevel, alertLevel) {
  if (chatLevel === 'all') return true;
  return chatLevel === alertLevel;
}

module.exports = { LEVELS, ALERT_LEVELS, DESCRIPTIONS, isValidLevel, isValidAlertLevel, describeLevel, levelMatches };
