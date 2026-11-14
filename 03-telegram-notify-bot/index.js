// Telegram notify bot (Telegraf) + HTTP alert endpoint.
//
// Commands (everyone):
//   /start, /help        — intro + command list
//   /menu                — inline-keyboard main menu
//   /status              — uptime + server time
//   /subscribe           — receive alerts from POST /alert
//   /unsubscribe         — stop receiving alerts
//   /level [all|info|important] — choose which alerts this chat gets
// Owner only (OWNER_CHAT_ID):
//   /send <chat> <msg>   — send a message to any chat id
//   /broadcast <msg>     — send to all subscribed chats
//   /stats               — subscribers, queue, uptime
//   /digest              — send today's digest now
// HTTP:
//   GET  /health         — { ok: true, uptime, subscribers, ... }
//   POST /alert { chatId?, message, level?, photoUrl?, caption? }
//        — forwards the alert to Telegram (broadcast if no chatId).
//        Send X-Alert-Key header if ALERT_KEY is set.
require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const { Store } = require('./lib/store');
const { isValidLevel, isValidAlertLevel, describeLevel } = require('./lib/settings');
const { broadcast, sendToOne, sendToChat } = require('./lib/alerts');
const { sendDigest, scheduleDigest, DEFAULT_CRON } = require('./lib/digest');
const { mainMenu, levelMenu } = require('./lib/keyboard');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;
const PORT = Number(process.env.PORT || 3000);
const ALERT_KEY = process.env.ALERT_KEY || '';
const DIGEST_CRON = process.env.DIGEST_CRON || DEFAULT_CRON;

if (!TOKEN || TOKEN === 'PASTE_YOUR_TELEGRAM_BOT_TOKEN_HERE') {
  console.error('Set TELEGRAM_BOT_TOKEN in your .env file first.');
  process.exit(1);
}

const store = new Store();
const bot = new Telegraf(TOKEN);
const startedAt = Date.now();

const isOwner = (ctx) => String(ctx.chat.id) === String(OWNER_CHAT_ID);
const chatTitle = (ctx) =>
  ctx.chat.title || ctx.chat.username || [ctx.chat.first_name, ctx.chat.last_name].filter(Boolean).join(' ') || '';

const HELP_TEXT =
  'Notify bot — commands:\n\n' +
  '/start — hello + what this bot does\n' +
  '/menu — buttons: status, subscribe, unsubscribe, help\n' +
  '/status — uptime + server time\n' +
  '/subscribe — receive alerts here\n' +
  '/unsubscribe — stop receiving alerts\n' +
  '/level [all|info|important] — which alerts this chat gets\n\n' +
  'Owner only:\n' +
  '/send <chat_id> <message> — message any chat\n' +
  '/broadcast <message> — message all subscribers\n' +
  '/stats — subscribers, queued alerts, uptime\n' +
  '/digest — send today\'s digest now';

function statusText() {
  const uptimeMin = Math.round(process.uptime() / 60);
  return (
    `Bot is up.\n` +
    `Uptime: ${uptimeMin} min\n` +
    `Subscribers: ${store.subscriberCount()}\n` +
    `Queued for digest: ${store.queueLength()}\n` +
    `Time: ${new Date().toISOString()}`
  );
}

// --- public commands -------------------------------------------------
bot.start((ctx) =>
  ctx.reply(
    'Hello! I am the notify bot. I forward alerts to Telegram and send a daily digest.\n\n' +
      'Use /menu for buttons, or /help for the full command list.',
    mainMenu()
  )
);

bot.help((ctx) => ctx.reply(HELP_TEXT, mainMenu()));
bot.command('menu', (ctx) => ctx.reply('Main menu:', mainMenu()));
bot.command('status', (ctx) => ctx.reply(statusText()));

bot.command('subscribe', (ctx) => {
  const isNew = store.subscribe(ctx.chat.id, chatTitle(ctx));
  return ctx.reply(
    isNew
      ? `Subscribed ✅ — this chat will now receive alerts (level: ${describeLevel(store.getLevel(ctx.chat.id))}).\nUse /level to change which alerts you get.`
      : 'This chat is already subscribed.',
    mainMenu()
  );
});

bot.command('unsubscribe', (ctx) => {
  const existed = store.unsubscribe(ctx.chat.id);
  return ctx.reply(
    existed ? 'Unsubscribed 🔕 — this chat will no longer receive alerts.' : 'This chat was not subscribed.',
    mainMenu()
  );
});

bot.command('level', (ctx) => {
  const arg = (ctx.message.text.split(/\s+/)[1] || '').toLowerCase();
  if (!arg) {
    return ctx.reply(
      `Current alert level: ${store.getLevel(ctx.chat.id)} (${describeLevel(store.getLevel(ctx.chat.id))}).\nPick a new one:`,
      levelMenu(store.getLevel(ctx.chat.id))
    );
  }
  if (!isValidLevel(arg)) {
    return ctx.reply('Usage: /level all | info | important');
  }
  store.setLevel(ctx.chat.id, arg);
  return ctx.reply(`Alert level set to ${arg} (${describeLevel(arg)}).`, mainMenu());
});

// --- owner commands ---------------------------------------------------
bot.command('send', async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('Sorry, that command is owner-only.');
  const parts = ctx.message.text.split(/\s+/);
  const target = parts[1];
  const text = parts.slice(2).join(' ');
  if (!target || !text) return ctx.reply('Usage: /send <chat_id> <message>');
  const ok = await sendToChat(ctx.telegram, target, { message: text, level: 'info' });
  await ctx.reply(ok ? 'Sent.' : 'Could not send — check the chat id and that the bot can message it.');
});

bot.command('broadcast', async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('Sorry, that command is owner-only.');
  const text = ctx.message.text.replace(/^\/broadcast\s*/, '');
  if (!text) return ctx.reply('Usage: /broadcast <message>');
  const result = await broadcast(ctx.telegram, store, { message: text, level: 'important' });
  store.queueAlert({ message: text, level: 'important' });
  await ctx.reply(
    `Broadcast done: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped (level filter).`
  );
});

bot.command('stats', (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('Sorry, that command is owner-only.');
  const uptimeHrs = (process.uptime() / 3600).toFixed(1);
  return ctx.reply(
    `📊 Stats\n` +
      `Subscribers: ${store.subscriberCount()}\n` +
      `Queued for digest: ${store.queueLength()}\n` +
      `Uptime: ${uptimeHrs} h (since ${new Date(startedAt).toISOString()})\n` +
      `Digest cron: ${DIGEST_CRON}`
  );
});

bot.command('digest', async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('Sorry, that command is owner-only.');
  const result = await sendDigest(ctx.telegram, store);
  await ctx.reply(
    result.count === 0
      ? 'Nothing queued for the digest.'
      : `Digest sent: ${result.count} alerts → ${result.sent} chats, ${result.failed} failed.`
  );
});

// --- inline-keyboard callbacks ----------------------------------------
bot.action('menu:status', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(statusText());
});

bot.action('menu:subscribe', async (ctx) => {
  await ctx.answerCbQuery();
  const isNew = store.subscribe(ctx.chat.id, chatTitle(ctx));
  await ctx.reply(
    isNew ? 'Subscribed ✅ — this chat will now receive alerts.' : 'This chat is already subscribed.'
  );
});

bot.action('menu:unsubscribe', async (ctx) => {
  await ctx.answerCbQuery();
  const existed = store.unsubscribe(ctx.chat.id);
  await ctx.reply(existed ? 'Unsubscribed 🔕.' : 'This chat was not subscribed.');
});

bot.action('menu:help', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(HELP_TEXT, mainMenu());
});

bot.action('menu:level', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Pick which alerts this chat receives:', levelMenu(store.getLevel(ctx.chat.id)));
});

bot.action('menu:main', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Main menu:', mainMenu());
});

bot.action(/^level:(all|info|important)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const level = ctx.match[1];
  store.setLevel(ctx.chat.id, level);
  await ctx.reply(`Alert level set to ${level} (${describeLevel(level)}).`, mainMenu());
});

bot.catch((err) => console.error('[bot] error:', err.message));

// --- HTTP alert endpoint ----------------------------------------------
const app = express();
app.use(express.json());

app.get('/health', (req, res) =>
  res.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    subscribers: store.subscriberCount(),
    queuedAlerts: store.queueLength(),
    time: new Date().toISOString(),
  })
);

app.post('/alert', async (req, res) => {
  if (ALERT_KEY && req.headers['x-alert-key'] !== ALERT_KEY) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  const body = req.body || {};
  const message = body.message ? String(body.message) : '';
  const level = body.level ? String(body.level).toLowerCase() : 'info';
  const photoUrl = body.photoUrl ? String(body.photoUrl) : null;
  const caption = body.caption ? String(body.caption) : null;
  const chatId = body.chatId != null ? String(body.chatId) : null;

  if (!message && !photoUrl) {
    return res.status(400).json({ ok: false, error: 'message or photoUrl required' });
  }
  if (!isValidAlertLevel(level)) {
    return res.status(400).json({ ok: false, error: 'level must be "info" or "important"' });
  }

  const alert = { message, level, photoUrl, caption };
  try {
    if (chatId) {
      // Targeted alert: send to one chat (skipped if its level filter rejects it).
      const result = await sendToOne(bot.telegram, store, chatId, alert);
      if (result.skipped) return res.json({ ok: true, sent: 0, skipped: true, reason: 'chat level filter' });
      return res.json({ ok: true, sent: result.sent ? 1 : 0, failed: result.sent ? 0 : 1 });
    }
    // Broadcast alert: every subscribed chat (level-filtered), then queue for the digest.
    const result = await broadcast(bot.telegram, store, alert);
    store.queueAlert(alert);
    return res.json({ ok: true, ...result, queuedForDigest: true });
  } catch (err) {
    console.error('[alert] error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// --- start -------------------------------------------------------------
const server = app.listen(PORT, () => {
  console.log(`Alert endpoint listening on port ${PORT} (POST /alert, GET /health).`);
});

scheduleDigest(bot.telegram, store, DIGEST_CRON);

bot.launch().then(() => console.log('Telegram bot started.'));

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down…`);
  server.close(() => console.log('HTTP server closed.'));
  bot.stop(signal);
}
