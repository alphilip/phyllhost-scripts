// test-self.js — verifies self-DM support (Levanter-style): the bot is
// operated from its own number. Run: node test-self.js
// No WhatsApp connection needed — the socket and queue are mocked.
const assert = require('node:assert');
const safety = require('./lib/safety');
const queue = require('./lib/queue');

// ---- 1. Loop guard: recordSent / wasOwnReply ----
safety.recordSent('123@s.whatsapp.net', 'hello');
assert.strictEqual(safety.wasOwnReply('123@s.whatsapp.net', 'hello'), true);
assert.strictEqual(safety.wasOwnReply('123@s.whatsapp.net', 'other'), false);
assert.strictEqual(safety.wasOwnReply('999@s.whatsapp.net', 'hello'), false);
// Only the last 10 sent texts per chat are remembered.
for (let i = 0; i < 12; i++) safety.recordSent('123@s.whatsapp.net', 't' + i);
assert.strictEqual(safety.wasOwnReply('123@s.whatsapp.net', 't0'), false);
assert.strictEqual(safety.wasOwnReply('123@s.whatsapp.net', 't11'), true);
console.log('loop guard: PASS');

// ---- 2. handleMessage with a mocked socket and queue ----
const { handleMessage } = require('./index');

// Stub the queue so nothing is really sent; record what would be sent.
const sent = [];
queue.enqueue = async (sock, jid, content) => {
  sent.push({ jid, text: content.text });
  return null;
};

const BOT_JID = '233200000000@s.whatsapp.net';
const fakeSock = {
  user: { id: BOT_JID },
  sendMessage: async () => ({}),
  groupMetadata: async () => ({ participants: [] })
};

function msg({ fromMe, remoteJid, text, participant }) {
  return {
    key: { fromMe: !!fromMe, remoteJid, participant },
    message: { conversation: text }
  };
}

(async () => {
  // (a) fromMe dot-command in the bot's own DM (self-chat) is handled.
  sent.length = 0;
  await handleMessage(fakeSock, msg({ fromMe: true, remoteJid: BOT_JID, text: '.menu' }));
  assert.ok(sent.length > 0, 'self .menu should reply');
  console.log('self-DM .menu in 1:1: PASS');

  // (b) fromMe dot-command in a DM with someone else is also handled.
  sent.length = 0;
  await handleMessage(fakeSock, msg({ fromMe: true, remoteJid: '233277111111@s.whatsapp.net', text: '.menu' }));
  assert.ok(sent.length > 0, 'self .menu in a DM should reply');
  console.log('self-DM .menu in a DM: PASS');

  // (c) Owner-only commands work from the bot's own DM.
  sent.length = 0;
  await handleMessage(fakeSock, msg({ fromMe: true, remoteJid: BOT_JID, text: '.subscribers' }));
  assert.ok(sent.length > 0, 'owner-only .subscribers should reply from self-DM');
  console.log('self-DM owner-only command: PASS');

  // (d) Plain "ping" from the bot's own number answers.
  sent.length = 0;
  await handleMessage(fakeSock, msg({ fromMe: true, remoteJid: BOT_JID, text: 'ping' }));
  assert.ok(sent.length === 1 && sent[0].text.includes('pong'), 'self ping should answer pong');
  console.log('self-DM ping: PASS');

  // (e) fromMe in a group is ignored — never in groups.
  sent.length = 0;
  await handleMessage(fakeSock, msg({ fromMe: true, remoteJid: '12345@g.us', text: '.menu', participant: BOT_JID }));
  assert.strictEqual(sent.length, 0, 'self group message must be ignored');
  console.log('self-DM ignored in groups: PASS');

  // (f) Own echo is ignored (loop guard): a fromMe message matching a
  // recent sent text is the bot's own reply, not a new command.
  sent.length = 0;
  safety.recordSent(BOT_JID, '.menu');
  await handleMessage(fakeSock, msg({ fromMe: true, remoteJid: BOT_JID, text: '.menu' }));
  assert.strictEqual(sent.length, 0, 'own echo must be ignored');
  console.log('own-echo loop guard: PASS');

  // (g) Plain text from the bot's own number gets no auto-reply.
  sent.length = 0;
  await handleMessage(fakeSock, msg({ fromMe: true, remoteJid: BOT_JID, text: 'hello there' }));
  assert.strictEqual(sent.length, 0, 'self plain text must not trigger auto-reply');
  console.log('self plain text ignored: PASS');

  // (h) A normal user .menu in 1:1 still works (no regression).
  sent.length = 0;
  await handleMessage(fakeSock, msg({ fromMe: false, remoteJid: '233277111111@s.whatsapp.net', text: '.menu' }));
  assert.ok(sent.length > 0, 'other user .menu should still reply');
  console.log('other-user .menu (no regression): PASS');

  console.log('All self-DM tests PASS');
})().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
