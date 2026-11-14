// index.js — entry point: connection, QR + pairing-code login, message routing.
// All outbound sends go through the paced queue (lib/queue.js).
// This bot only replies to people who message it, or to group members in
// groups it was added to. It never messages strangers and never sends
// unsolicited messages — the only exception is .broadcast, which goes
// solely to people who opted in with .subscribe.
require('dotenv').config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const store = require('./lib/store');
const queue = require('./lib/queue');
const safety = require('./lib/safety');
const commands = require('./lib/commands');
const moderation = require('./lib/moderation');

const PREFIX = config.prefix;

async function start() {
  store.load();
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: !config.pairingCode,
    logger: pino({ level: 'silent' }),
    browser: [config.botName, 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  // Pairing-code login: instead of scanning a QR code, the bot prints an
  // 8-digit code to enter on the phone (WhatsApp > Linked Devices > Link
  // with phone number). Enable with PAIRING_CODE=true and PAIRING_NUMBER.
  if (config.pairingCode && !state.creds.registered) {
    const number = config.pairingNumber || config.ownerNumber;
    if (!number) {
      console.error('PAIRING_CODE=true but no PAIRING_NUMBER or OWNER_NUMBER is set.');
    } else {
      // Wait a moment for the socket to be ready, then request the code.
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(number);
          console.log(`\nPairing code for +${number}: ${code}\nEnter it in WhatsApp > Linked Devices > Link with phone number.\n`);
        } catch (err) {
          console.error('Failed to get pairing code:', err.message);
        }
      }, 3000);
    }
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr && !config.pairingCode) {
      // printQRInTerminal already shows it; this is a fallback render.
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log(loggedOut
        ? 'Logged out — delete the session folder and re-pair.'
        : 'Connection closed — reconnecting in 5s...');
      if (!loggedOut) setTimeout(start, 5000);
    } else if (connection === 'open') {
      console.log(`${config.botName} connected and online as ${sock.user?.id || 'unknown'}.`);
      console.log(`Mode: ${store.get().mode} | Prefix: ${PREFIX} | Daily cap: ${config.queue.dailyCap} sends`);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        await handleMessage(sock, m);
      } catch (err) {
        console.error('[msg] error:', err.message);
      }
    }
  });

  // Welcome new group members (only when the group enabled .welcome).
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    if (action !== 'add') return;
    try {
      const settings = store.groupSettings(id);
      if (!settings.welcome) return;
      const meta = await sock.groupMetadata(id);
      for (const p of participants) {
        if (safety.digits(p) === safety.digits(sock.user.id)) continue; // don't welcome self
        await queue.enqueue(sock, id, {
          text: `👋 Welcome to *${meta.subject}*, @${safety.digits(p)}! Type ${PREFIX}menu to see what I can do.`,
          mentions: [p]
        });
      }
    } catch (err) {
      console.error('[welcome] error:', err.message);
    }
  });
}

async function handleMessage(sock, m) {
  if (!m.message) return;
  if (m.key.remoteJid === 'status@broadcast') return;

  const chatJid = m.key.remoteJid;
  const isGroup = safety.isGroup(chatJid);
  const sender = safety.senderOf(m);
  const text = safety.messageText(m);

  // Self-DM (Levanter-style): the bot is operated from its own number.
  // A message sent from the bot's own account counts as the owner, but
  // ONLY in 1:1 chats — never in groups (the bot never acts on its own
  // group messages). The loop guard drops the bot's own replies, so a
  // self-command answer can never trigger itself.
  const fromMe = !!m.key.fromMe;
  if (fromMe && isGroup) return; // never act on own group messages
  if (fromMe && safety.wasOwnReply(chatJid, text)) return; // own echo, ignore
  const owner = safety.isOwner(sender) || fromMe;

  const ctx = { sock, msg: m, chatJid, sender, args: [], isGroup, owner, command: null };

  // Group moderation runs before commands (anti-link / anti-spam).
  // Self messages never reach here in groups (returned above).
  if (isGroup && text) {
    const handled = await moderation.moderate(sock, m, chatJid, text);
    if (handled) return;
  }

  if (!text) return;

  // Commands start with the prefix.
  if (text.startsWith(PREFIX)) {
    const parts = text.slice(PREFIX.length).trim().split(/\s+/);
    const command = (parts[0] || '').toLowerCase();
    ctx.command = command;
    ctx.args = parts.slice(1);
    const handled = await commands.handleCommand(ctx);
    if (!handled && !isGroup) {
      await queue.enqueue(sock, chatJid, {
        text: `Unknown command "${PREFIX}${command}". Type ${PREFIX}menu for the list.`
      });
    }
    return;
  }

  // Plain "ping" from the bot's own number also answers (self-test).
  if (fromMe && text.toLowerCase() === 'ping') {
    await queue.enqueue(sock, chatJid, { text: 'pong 🏓' });
    return;
  }

  // No command — try keyword auto-replies (1:1 chats and groups).
  // Not for the bot's own plain text: the owner drives the bot with commands.
  if (fromMe) return;
  await commands.handleAutoReply(ctx, text);
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { handleMessage };
