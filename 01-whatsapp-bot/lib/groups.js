// lib/groups.js — group tools (group admin or owner only).
// .tagall, .hidetag, .promote, .demote, .kick, .mute, .unmute,
// .antilink, .welcome, .groupinfo
const { isGroupAdmin, isBotAdmin, digits } = require('./safety');
const store = require('./store');
const queue = require('./queue');

/** Resolve a target user from a mention, a reply, or a raw number. */
function resolveTarget(msg, args) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
  if (ctx.mentionedJid?.length) return ctx.mentionedJid[0];
  if (ctx.participant) return ctx.participant;
  const raw = (args[0] || '').replace(/\D/g, '');
  if (raw) return `${raw}@s.whatsapp.net`;
  return null;
}

function mentionList(participants) {
  return participants.map((p) => p.id);
}

async function tagAll(ctx, args) {
  const { sock, msg, chatJid } = ctx;
  const meta = await sock.groupMetadata(chatJid);
  const text = args.join(' ') || 'Attention everyone!';
  const mentions = mentionList(meta.participants);
  const lines = meta.participants.map((p) => `• @${digits(p.id)}`).join('\n');
  await queue.enqueue(sock, chatJid, {
    text: `${text}\n\n${lines}`,
    mentions
  });
}

async function hideTag(ctx, args) {
  const { sock, msg, chatJid } = ctx;
  const text = args.join(' ');
  if (!text) throw new Error('Usage: .hidetag <message>');
  const meta = await sock.groupMetadata(chatJid);
  await queue.enqueue(sock, chatJid, {
    text,
    mentions: mentionList(meta.participants)
  });
}

async function promote(ctx, args) {
  const { sock, msg, chatJid } = ctx;
  const target = resolveTarget(msg, args);
  if (!target) throw new Error('Usage: .promote @user (mention or reply to them)');
  if (!(await isBotAdmin(sock, chatJid))) throw new Error('I need to be a group admin to promote members.');
  await sock.groupParticipantsUpdate(chatJid, [target], 'promote');
  await queue.enqueue(sock, chatJid, { text: `✅ @${digits(target)} is now an admin.`, mentions: [target] });
}

async function demote(ctx, args) {
  const { sock, msg, chatJid } = ctx;
  const target = resolveTarget(msg, args);
  if (!target) throw new Error('Usage: .demote @user (mention or reply to them)');
  if (!(await isBotAdmin(sock, chatJid))) throw new Error('I need to be a group admin to demote members.');
  await sock.groupParticipantsUpdate(chatJid, [target], 'demote');
  await queue.enqueue(sock, chatJid, { text: `✅ @${digits(target)} is no longer an admin.`, mentions: [target] });
}

async function kick(ctx, args) {
  const { sock, msg, chatJid } = ctx;
  const target = resolveTarget(msg, args);
  if (!target) throw new Error('Usage: .kick @user (mention or reply to them)');
  if (digits(target) === digits(sock.user.id)) throw new Error('I cannot remove myself.');
  if (!(await isBotAdmin(sock, chatJid))) throw new Error('I need to be a group admin to remove members.');
  await sock.groupParticipantsUpdate(chatJid, [target], 'remove');
  await queue.enqueue(sock, chatJid, { text: `👋 @${digits(target)} was removed from the group.`, mentions: [target] });
}

async function mute(ctx) {
  const { sock, chatJid } = ctx;
  if (!(await isBotAdmin(sock, chatJid))) throw new Error('I need to be a group admin to mute the group.');
  await sock.groupSettingUpdate(chatJid, 'announcement');
  await queue.enqueue(sock, chatJid, { text: '🔇 Group muted — only admins can send messages now.' });
}

async function unmute(ctx) {
  const { sock, chatJid } = ctx;
  if (!(await isBotAdmin(sock, chatJid))) throw new Error('I need to be a group admin to unmute the group.');
  await sock.groupSettingUpdate(chatJid, 'not_announced');
  await queue.enqueue(sock, chatJid, { text: '🔊 Group unmuted — everyone can send messages again.' });
}

async function antiLink(ctx, args) {
  const { sock, chatJid } = ctx;
  const arg = (args[0] || '').toLowerCase();
  if (arg !== 'on' && arg !== 'off') throw new Error('Usage: .antilink on | off');
  const on = arg === 'on';
  store.setGroupSetting(chatJid, 'antilink', on);
  await queue.enqueue(sock, chatJid, {
    text: on
      ? '🔗 Anti-link is ON — links from non-admins will be deleted and warned.'
      : '🔗 Anti-link is OFF.'
  });
}

async function welcome(ctx, args) {
  const { sock, chatJid } = ctx;
  const arg = (args[0] || '').toLowerCase();
  if (arg !== 'on' && arg !== 'off') throw new Error('Usage: .welcome on | off');
  const on = arg === 'on';
  store.setGroupSetting(chatJid, 'welcome', on);
  await queue.enqueue(sock, chatJid, {
    text: on ? '👋 Welcome messages are ON.' : '👋 Welcome messages are OFF.'
  });
}

async function groupInfo(ctx) {
  const { sock, chatJid } = ctx;
  const meta = await sock.groupMetadata(chatJid);
  const settings = store.groupSettings(chatJid);
  const admins = meta.participants.filter((p) => p.admin).length;
  const text =
    `*${meta.subject}*\n\n` +
    `👥 Members: ${meta.participants.length} (${admins} admins)\n` +
    `🆔 ID: ${meta.id}\n` +
    `📝 Description: ${meta.desc || '—'}\n` +
    `🔗 Anti-link: ${settings.antilink ? 'ON' : 'OFF'}\n` +
    `👋 Welcome: ${settings.welcome ? 'ON' : 'OFF'}\n` +
    `⚠️ Warn limit: ${settings.warnLimit}`;
  await queue.enqueue(sock, chatJid, { text });
}

module.exports = {
  tagAll, hideTag, promote, demote, kick, mute, unmute,
  antiLink, welcome, groupInfo, resolveTarget
};
