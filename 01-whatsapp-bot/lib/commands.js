// lib/commands.js — command registry, .menu text and all command handlers.
// Every handler receives a context object:
//   { sock, msg, chatJid, sender, args, isGroup, owner }
// and sends replies ONLY through the paced queue (lib/queue.js).
// Handlers throw Error with a usage message on bad input — index.js turns
// that into a reply instead of a crash.
const config = require('../config');
const store = require('./store');
const queue = require('./queue');
const safety = require('./safety');
const utils = require('./utils');
const stickers = require('./stickers');
const downloaders = require('./downloaders');
const ai = require('./ai');
const groups = require('./groups');
const moderation = require('./moderation');

const startedAt = Date.now();

function uptime() {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

const MENU = `*${config.botName}* — commands (prefix: ${config.prefix})

*General*
${config.prefix}menu / ${config.prefix}help — this list
${config.prefix}ping — check the bot is alive
${config.prefix}info — bot info and uptime
${config.prefix}subscribe — get owner announcements (opt-in)
${config.prefix}unsubscribe — stop owner announcements

*Stickers*
${config.prefix}sticker — image/video → sticker (send or reply with media)
${config.prefix}toimg — sticker → image (reply to a sticker)

*Downloaders*
${config.prefix}dl <url> — download a video link (max ~50 MB)
${config.prefix}dlmp3 <url> — download audio only (mp3)

*AI*
${config.prefix}ai <prompt> — ask the AI (Groq → Gemini → free fallback)

*Utilities*
${config.prefix}qr <text> — make a QR code image
${config.prefix}wiki <topic> — Wikipedia summary
${config.prefix}calc <expression> — calculator, e.g. .calc (12+8)*3/2
${config.prefix}translate <lang> <text> — translate, e.g. .translate fr Hello

*Group tools (admins only)*
${config.prefix}tagall [text] — mention everyone
${config.prefix}hidetag <text> — message that mentions everyone silently
${config.prefix}promote @user — make admin
${config.prefix}demote @user — remove admin
${config.prefix}kick @user — remove from group
${config.prefix}mute / ${config.prefix}unmute — admins-only chat on/off
${config.prefix}antilink on|off — delete links from non-admins
${config.prefix}welcome on|off — welcome new members
${config.prefix}groupinfo — group details and settings

*Moderation (admins only)*
${config.prefix}warn @user [reason] — warn (limit: ${config.moderation.warnLimit}, then removed)
${config.prefix}unwarn @user — clear warns
${config.prefix}warnings [@user] — show warn count
${config.prefix}ban @user — remove from group

*Owner only*
${config.prefix}mode public|self — who can use commands
${config.prefix}broadcast <message> — message to OPT-IN subscribers only
${config.prefix}addreply <keyword> | <reply> — add an auto-reply
${config.prefix}delreply <keyword> — remove an auto-reply
${config.prefix}replies — list auto-replies
${config.prefix}subscribers — how many people opted in`;

const HELP_ALIASES = ['menu', 'help', 'start'];

// ---- general ----

async function ping(ctx) {
  await queue.enqueue(ctx.sock, ctx.chatJid, { text: `🏓 pong — ${config.botName} is online (uptime ${uptime()}).` });
}

async function info(ctx) {
  const text =
    `*${config.botName}*\n\n` +
    `⏱️ Uptime: ${uptime()}\n` +
    `📤 Sends today: ${store.dailySent()}/${config.queue.dailyCap} (daily cap)\n` +
    `📬 Queued: ${queue.pendingCount()}\n` +
    `🔒 Mode: ${store.get().mode}\n` +
    `📨 Subscribers (opt-in): ${store.get().subscribers.length}\n\n` +
    `Type ${config.prefix}menu for the command list.`;
  await queue.enqueue(ctx.sock, ctx.chatJid, { text });
}

async function subscribe(ctx) {
  const added = store.subscribe(ctx.sender);
  await queue.enqueue(ctx.sock, ctx.chatJid, {
    text: added
      ? '✅ Subscribed! You will receive owner announcements. Send .unsubscribe anytime to stop.'
      : 'You are already subscribed. Send .unsubscribe anytime to stop.'
  });
}

async function unsubscribe(ctx) {
  const removed = store.unsubscribe(ctx.sender);
  await queue.enqueue(ctx.sock, ctx.chatJid, {
    text: removed ? '✅ Unsubscribed — you will not receive owner announcements.' : 'You were not subscribed.'
  });
}

// ---- stickers ----

async function stickerCmd(ctx) {
  const { webp } = await stickers.toSticker(ctx.msg);
  await queue.enqueue(ctx.sock, ctx.chatJid, { sticker: webp });
}

async function toImgCmd(ctx) {
  const png = await stickers.stickerToImage(ctx.msg);
  await queue.enqueue(ctx.sock, ctx.chatJid, { image: png, caption: 'Here is your image 👇' });
}

// ---- downloaders ----

async function dlCmd(ctx, audioOnly) {
  const url = ctx.args[0];
  if (!url) throw new Error(`Usage: ${config.prefix}${audioOnly ? 'dlmp3' : 'dl'} <url>`);
  await queue.enqueue(ctx.sock, ctx.chatJid, { text: '⏬ Downloading… (max ~50 MB)' });
  let result;
  try {
    result = await downloaders.download(url, audioOnly);
  } catch (err) {
    await queue.enqueue(ctx.sock, ctx.chatJid, { text: `❌ ${err.message}` });
    return;
  }
  try {
    if (result.isAudio) {
      await queue.enqueue(ctx.sock, ctx.chatJid, {
        audio: { url: result.file },
        mimetype: 'audio/mpeg',
        fileName: `${result.title}.mp3`
      });
    } else {
      await queue.enqueue(ctx.sock, ctx.chatJid, {
        video: { url: result.file },
        caption: `${result.title}\n(${downloaders.humanSize(result.size)})`
      });
    }
  } finally {
    downloaders.cleanupFile(result.file);
  }
}

// ---- AI ----

async function aiCmd(ctx) {
  const prompt = ctx.args.join(' ');
  if (!prompt) throw new Error(`Usage: ${config.prefix}ai <prompt>`);
  await queue.enqueue(ctx.sock, ctx.chatJid, { text: '🤖 Thinking…' });
  try {
    const { answer, provider } = await ai.ask(prompt);
    await queue.enqueue(ctx.sock, ctx.chatJid, { text: `${answer}\n\n— via ${provider}` });
  } catch (err) {
    await queue.enqueue(ctx.sock, ctx.chatJid, { text: `❌ ${err.message}` });
  }
}

// ---- utilities ----

async function qrCmd(ctx) {
  const text = ctx.args.join(' ');
  const png = await utils.makeQrBuffer(text);
  await queue.enqueue(ctx.sock, ctx.chatJid, { image: png, caption: `QR code for:\n${text}` });
}

async function wikiCmd(ctx) {
  const topic = ctx.args.join(' ');
  try {
    const summary = await utils.wikiSummary(topic);
    await queue.enqueue(ctx.sock, ctx.chatJid, { text: summary });
  } catch (err) {
    await queue.enqueue(ctx.sock, ctx.chatJid, { text: `❌ ${err.message}` });
  }
}

async function calcCmd(ctx) {
  const expression = ctx.args.join(' ');
  try {
    const result = utils.calc(expression);
    await queue.enqueue(ctx.sock, ctx.chatJid, { text: `🧮 ${expression} = *${result}*` });
  } catch (err) {
    await queue.enqueue(ctx.sock, ctx.chatJid, { text: `❌ ${err.message}` });
  }
}

async function translateCmd(ctx) {
  const [lang, ...rest] = ctx.args;
  const text = rest.join(' ');
  try {
    const translated = await utils.translate(lang, text);
    await queue.enqueue(ctx.sock, ctx.chatJid, { text: `🌐 (${lang})\n${translated}` });
  } catch (err) {
    await queue.enqueue(ctx.sock, ctx.chatJid, { text: `❌ ${err.message}` });
  }
}

// ---- owner ----

async function modeCmd(ctx) {
  const mode = (ctx.args[0] || '').toLowerCase();
  if (mode !== 'public' && mode !== 'self') {
    throw new Error(`Usage: ${config.prefix}mode public|self\nCurrent mode: ${store.get().mode}`);
  }
  store.get().mode = mode;
  store.save();
  await queue.enqueue(ctx.sock, ctx.chatJid, {
    text: mode === 'self'
      ? '🔒 Self mode ON — only you (the owner) can use commands now.'
      : '🔓 Public mode ON — anyone can use commands.'
  });
}

async function broadcastCmd(ctx) {
  const message = ctx.args.join(' ');
  if (!message) throw new Error(`Usage: ${config.prefix}broadcast <message>\nSends only to people who opted in with ${config.prefix}subscribe.`);
  const list = [...store.get().subscribers];
  if (list.length === 0) {
    await queue.enqueue(ctx.sock, ctx.chatJid, { text: 'Nobody has opted in yet. People subscribe with .subscribe.' }, { owner: true });
    return;
  }
  await queue.enqueue(ctx.sock, ctx.chatJid, {
    text: `📣 Sending your announcement to ${list.length} opt-in subscriber(s)… (paced, one at a time)`
  }, { owner: true });
  // Each subscriber gets their own queued send — paced, capped, never a burst.
  for (const jid of list) {
    queue.enqueue(ctx.sock, jid, { text: `📣 *Announcement from ${config.botName}*\n\n${message}\n\n_(You opted in with .subscribe — send .unsubscribe to stop.)_` })
      .catch((err) => console.error('[broadcast] failed for', jid, err.message));
  }
}

async function addReplyCmd(ctx) {
  const raw = ctx.args.join(' ');
  const sep = raw.indexOf('|');
  if (sep < 0) throw new Error(`Usage: ${config.prefix}addreply <keyword> | <reply>\nExample: ${config.prefix}addreply delivery | Yes, we deliver in Accra.`);
  const keyword = raw.slice(0, sep).trim();
  const reply = raw.slice(sep + 1).trim();
  if (!keyword || !reply) throw new Error('Both a keyword and a reply are required.');
  store.addAutoReply(keyword, reply);
  await queue.enqueue(ctx.sock, ctx.chatJid, { text: `✅ Auto-reply added for "${keyword}".` }, { owner: true });
}

async function delReplyCmd(ctx) {
  const keyword = ctx.args.join(' ');
  if (!keyword) throw new Error(`Usage: ${config.prefix}delreply <keyword>`);
  const removed = store.removeAutoReply(keyword);
  await queue.enqueue(ctx.sock, ctx.chatJid, {
    text: removed ? `✅ Auto-reply for "${keyword}" removed.` : `No auto-reply found for "${keyword}".`
  }, { owner: true });
}

async function repliesCmd(ctx) {
  const entries = Object.entries(store.get().autoReplies);
  const text = entries.length === 0
    ? 'No auto-replies set.'
    : '*Auto-replies*\n\n' + entries.map(([k, v]) => `• *${k}* → ${v}`).join('\n');
  await queue.enqueue(ctx.sock, ctx.chatJid, { text }, { owner: true });
}

async function subscribersCmd(ctx) {
  const list = store.get().subscribers;
  const text = list.length === 0
    ? 'No subscribers yet.'
    : `📨 ${list.length} opt-in subscriber(s):\n` + list.map((j) => `• +${safety.digits(j)}`).join('\n');
  await queue.enqueue(ctx.sock, ctx.chatJid, { text }, { owner: true });
}

// ---- registry ----
// Each entry: { handler, groupOnly?, adminOnly?, ownerOnly? }
const COMMANDS = {
  menu: { handler: async (ctx) => queue.enqueue(ctx.sock, ctx.chatJid, { text: MENU }) },
  help: { handler: async (ctx) => queue.enqueue(ctx.sock, ctx.chatJid, { text: MENU }) },
  start: { handler: async (ctx) => queue.enqueue(ctx.sock, ctx.chatJid, { text: MENU }) },
  ping: { handler: ping },
  info: { handler: info },
  subscribe: { handler: subscribe },
  unsubscribe: { handler: unsubscribe },
  sticker: { handler: stickerCmd },
  toimg: { handler: toImgCmd },
  dl: { handler: (ctx) => dlCmd(ctx, false) },
  dlmp3: { handler: (ctx) => dlCmd(ctx, true) },
  ai: { handler: aiCmd },
  qr: { handler: qrCmd },
  wiki: { handler: wikiCmd },
  calc: { handler: calcCmd },
  translate: { handler: translateCmd },
  tagall: { handler: groups.tagAll, groupOnly: true, adminOnly: true },
  hidetag: { handler: groups.hideTag, groupOnly: true, adminOnly: true },
  promote: { handler: groups.promote, groupOnly: true, adminOnly: true },
  demote: { handler: groups.demote, groupOnly: true, adminOnly: true },
  kick: { handler: groups.kick, groupOnly: true, adminOnly: true },
  mute: { handler: groups.mute, groupOnly: true, adminOnly: true },
  unmute: { handler: groups.unmute, groupOnly: true, adminOnly: true },
  antilink: { handler: groups.antiLink, groupOnly: true, adminOnly: true },
  welcome: { handler: groups.welcome, groupOnly: true, adminOnly: true },
  groupinfo: { handler: groups.groupInfo, groupOnly: true, adminOnly: true },
  warn: { handler: moderation.warnCmd, groupOnly: true, adminOnly: true },
  unwarn: { handler: moderation.unwarnCmd, groupOnly: true, adminOnly: true },
  warnings: { handler: moderation.warningsCmd, groupOnly: true, adminOnly: true },
  ban: { handler: moderation.banCmd, groupOnly: true, adminOnly: true },
  mode: { handler: modeCmd, ownerOnly: true },
  broadcast: { handler: broadcastCmd, ownerOnly: true },
  addreply: { handler: addReplyCmd, ownerOnly: true },
  delreply: { handler: delReplyCmd, ownerOnly: true },
  replies: { handler: repliesCmd, ownerOnly: true },
  subscribers: { handler: subscribersCmd, ownerOnly: true }
};

async function handleCommand(ctx) {
  const entry = COMMANDS[ctx.command];
  if (!entry) return false;

  // Self mode: only the owner may use commands.
  if (store.get().mode === 'self' && !ctx.owner) return true; // silently ignore

  if (entry.ownerOnly && !ctx.owner) {
    await queue.enqueue(ctx.sock, ctx.chatJid, { text: '⛔ That command is owner-only.' });
    return true;
  }
  if (entry.groupOnly && !ctx.isGroup) {
    await queue.enqueue(ctx.sock, ctx.chatJid, { text: '⛔ That command only works inside a group.' });
    return true;
  }
  if (entry.adminOnly && !(await safety.isGroupAdmin(ctx.sock, ctx.chatJid, ctx.sender))) {
    await queue.enqueue(ctx.sock, ctx.chatJid, { text: '⛔ Only group admins can use that command.' });
    return true;
  }

  try {
    await entry.handler(ctx);
  } catch (err) {
    await queue.enqueue(ctx.sock, ctx.chatJid, { text: `❌ ${err.message}` });
  }
  return true;
}

/** Check a non-command message against the configured keyword auto-replies. */
async function handleAutoReply(ctx, text) {
  if (store.get().mode === 'self' && !ctx.owner) return false;
  const lower = text.toLowerCase();
  for (const [keyword, reply] of Object.entries(store.get().autoReplies)) {
    if (lower.includes(keyword)) {
      await queue.enqueue(ctx.sock, ctx.chatJid, { text: reply });
      return true;
    }
  }
  return false;
}

module.exports = { MENU, COMMANDS, handleCommand, handleAutoReply, uptime, HELP_ALIASES };
