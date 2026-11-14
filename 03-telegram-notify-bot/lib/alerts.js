// Sending alerts to Telegram: single chat, broadcast to subscribers,
// and photo alerts. Delivery always respects the recipient's level setting.
const { levelMatches } = require('./settings');

const LEVEL_EMOJI = { info: 'ℹ️', important: '🚨' };

function formatAlert(message, level) {
  const emoji = LEVEL_EMOJI[level] || LEVEL_EMOJI.info;
  return `${emoji} ${message}`;
}

// Send one alert (text or photo) to one chat. Returns true on success.
async function sendToChat(telegram, chatId, { message, level = 'info', photoUrl, caption }) {
  const text = formatAlert(message, level);
  try {
    if (photoUrl) {
      await telegram.sendPhoto(chatId, photoUrl, { caption: caption || text });
    } else {
      await telegram.sendMessage(chatId, text);
    }
    return true;
  } catch (err) {
    console.error(`[alerts] failed to send to ${chatId}:`, err.message);
    return false;
  }
}

// Send an alert to every subscribed chat whose level setting accepts it.
// Returns { sent, failed, skipped } counts.
async function broadcast(telegram, store, alert) {
  const level = alert.level || 'info';
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const chatId of store.subscribedChatIds()) {
    if (!levelMatches(store.getLevel(chatId), level)) {
      skipped += 1;
      continue;
    }
    const ok = await sendToChat(telegram, chatId, alert);
    if (ok) sent += 1;
    else failed += 1;
  }
  return { sent, failed, skipped };
}

// Send to one specific chat. If that chat has a level setting and the
// alert doesn't match it, the send is skipped (returns { skipped: true }).
async function sendToOne(telegram, store, chatId, alert) {
  const level = alert.level || 'info';
  if (!levelMatches(store.getLevel(chatId), level)) {
    return { sent: false, skipped: true };
  }
  const ok = await sendToChat(telegram, chatId, alert);
  return { sent: ok, skipped: false };
}

module.exports = { LEVEL_EMOJI, formatAlert, sendToChat, broadcast, sendToOne };
