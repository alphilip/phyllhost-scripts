// lib/safety.js — identity + permission helpers and the anti-spam tracker.
// Nothing here sends messages on its own; it only answers questions the
// command handlers and moderation code ask.
const config = require('../config');

function digits(jid) {
  return String(jid || '').replace(/\D/g, '');
}

/** True when the JID belongs to the configured owner number. */
function isOwner(jid) {
  if (!config.ownerNumber) return false;
  return digits(jid).startsWith(config.ownerNumber);
}

/** True when the JID is the bot itself (messages sent from the bot number). */
function isSelf(jid, sock) {
  const self = sock?.user?.id || '';
  return !!self && digits(jid) === digits(self);
}

function isGroup(jid) {
  return String(jid || '').endsWith('@g.us');
}

function senderOf(msg) {
  // In groups the sender is key.participant; in 1:1 chats it is remoteJid.
  return msg.key.participant || msg.key.remoteJid;
}

/** Extract plain text from a message (conversation or extended text). */
function messageText(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  ).trim();
}

/** Group metadata cache (5 min) so admin checks don't hammer WhatsApp. */
const metaCache = new Map(); // jid -> { at, meta }

async function groupMetadata(sock, jid) {
  const cached = metaCache.get(jid);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.meta;
  const meta = await sock.groupMetadata(jid);
  metaCache.set(jid, { at: Date.now(), meta });
  return meta;
}

/** True when the sender is a group admin (or the owner). */
async function isGroupAdmin(sock, groupJid, userJid) {
  if (isOwner(userJid)) return true;
  try {
    const meta = await groupMetadata(sock, groupJid);
    const p = meta.participants.find((x) => digits(x.id) === digits(userJid));
    return !!p && (p.admin === 'admin' || p.admin === 'superadmin');
  } catch (err) {
    console.error('[safety] groupMetadata failed:', err.message);
    return false;
  }
}

/** True when the bot itself is a group admin (needed for kick/promote). */
async function isBotAdmin(sock, groupJid) {
  try {
    const meta = await groupMetadata(sock, groupJid);
    const me = meta.participants.find((x) => digits(x.id) === digits(sock.user.id));
    return !!me && (me.admin === 'admin' || me.admin === 'superadmin');
  } catch (err) {
    return false;
  }
}

// ---- anti-spam: per-user message rate inside a rolling window ----
const spamBuckets = new Map(); // `${groupJid}:${userJid}` -> [timestamps]

function isSpamming(groupJid, userJid) {
  const { spamMaxMessages, spamWindowMs } = config.moderation;
  const key = `${groupJid}:${userJid}`;
  const now = Date.now();
  const bucket = (spamBuckets.get(key) || []).filter((t) => now - t < spamWindowMs);
  bucket.push(now);
  spamBuckets.set(key, bucket);
  return bucket.length > spamMaxMessages;
}

// ---- self-DM loop guard (Levanter-style) ----
// Every text the bot sends is remembered per chat (last 10, recorded at
// enqueue time in lib/queue.js). When a message arrives from the bot's own
// number, it is ignored if it matches a recent own reply — that is the
// bot's own echo, not a new command. Without this, a self-command reply
// would trigger itself in a loop.
const sentTexts = new Map(); // jid -> [text, ...] (most recent last)

function recordSent(jid, text) {
  if (!jid || !text) return;
  const list = sentTexts.get(jid) || [];
  list.push(String(text));
  if (list.length > 10) list.shift();
  sentTexts.set(jid, list);
}

function wasOwnReply(jid, text) {
  if (!jid || !text) return false;
  const list = sentTexts.get(jid) || [];
  return list.includes(String(text));
}

// ---- link detection (used by anti-link moderation) ----
const LINK_RE = /https?:\/\/\S+|www\.\S+|chat\.whatsapp\.com\/\S+/i;

function containsLink(text) {
  return LINK_RE.test(text || '');
}

module.exports = {
  digits,
  isOwner,
  isSelf,
  isGroup,
  senderOf,
  messageText,
  groupMetadata,
  isGroupAdmin,
  isBotAdmin,
  isSpamming,
  containsLink,
  recordSent,
  wasOwnReply
};
