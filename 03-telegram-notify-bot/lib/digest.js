// Scheduled digest: alerts are queued as they arrive (see store.queueAlert)
// and once a day the bot sends every subscribed chat a summary, then
// clears the queue. Triggered by node-cron from index.js, and on demand
// by the owner's /digest command.
const cron = require('node-cron');
const { LEVEL_EMOJI } = require('./alerts');
const { levelMatches } = require('./settings');

const DEFAULT_CRON = '0 8 * * *'; // every day at 08:00 server time

function buildDigestMessage(items, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const lines = [`📰 Daily digest — ${day}`, ''];
  const important = items.filter((i) => i.level === 'important');
  const info = items.filter((i) => i.level !== 'important');

  if (important.length) {
    lines.push('🚨 Important:');
    for (const item of important) lines.push(`• ${item.message}`);
    lines.push('');
  }
  if (info.length) {
    lines.push('ℹ️ Info:');
    for (const item of info) lines.push(`• ${item.message}`);
    lines.push('');
  }
  lines.push(`Total: ${items.length} alert${items.length === 1 ? '' : 's'} since the last digest.`);
  return lines.join('\n');
}

// Build and send the digest to every subscriber. Queued items are taken
// (and cleared) first, so a failed send never re-sends the same digest.
// Returns { sent, failed, count } — count is the number of alerts digested.
async function sendDigest(telegram, store) {
  const items = store.takeQueue();
  if (!items.length) return { sent: 0, failed: 0, count: 0 };
  const text = buildDigestMessage(items);
  let sent = 0;
  let failed = 0;
  for (const chatId of store.subscribedChatIds()) {
    // A chat set to "important" only gets the digest if it contains
    // important items; "info"-only chats get it if it contains info items.
    const wantsIt =
      store.getLevel(chatId) === 'all' ||
      items.some((i) => levelMatches(store.getLevel(chatId), i.level));
    if (!wantsIt) continue;
    try {
      await telegram.sendMessage(chatId, text);
      sent += 1;
    } catch (err) {
      console.error(`[digest] failed to send to ${chatId}:`, err.message);
      failed += 1;
    }
  }
  return { sent, failed, count: items.length };
}

// Schedule the daily digest. `expression` is a cron string, default 08:00 daily.
function scheduleDigest(telegram, store, expression = DEFAULT_CRON) {
  if (!cron.validate(expression)) {
    console.error(`[digest] invalid cron expression "${expression}", digest disabled.`);
    return null;
  }
  const task = cron.schedule(expression, () => {
    console.log('[digest] sending scheduled digest…');
    sendDigest(telegram, store).then((r) =>
      console.log(`[digest] done: ${r.count} alerts → ${r.sent} chats, ${r.failed} failed.`)
    );
  });
  console.log(`[digest] scheduled with cron "${expression}".`);
  return task;
}

module.exports = { DEFAULT_CRON, buildDigestMessage, sendDigest, scheduleDigest };
