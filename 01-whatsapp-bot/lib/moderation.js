// lib/moderation.js — anti-link, anti-spam, warn/ban with a warn limit.
// Per-group settings live in the store. Warns: 3 (configurable) then the
// member is removed from the group. Admins and the owner are exempt.
// This module only moderates messages sent to groups the bot is in —
// it never touches anyone outside those groups.
const store = require('./store');
const queue = require('./queue');
const { isOwner, isGroupAdmin, isBotAdmin, isSpamming, containsLink, digits, senderOf } = require('./safety');

/**
 * Run moderation on one incoming group message.
 * @returns {Promise<boolean>} true when the message was handled (deleted/warned)
 */
async function moderate(sock, msg, chatJid, text) {
  const settings = store.groupSettings(chatJid);
  const sender = senderOf(msg);
  if (isOwner(sender)) return false;
  if (await isGroupAdmin(sock, chatJid, sender)) return false;

  // Anti-link: delete + warn.
  if (settings.antilink && containsLink(text)) {
    await deleteMessage(sock, chatJid, msg);
    await warn(sock, chatJid, sender, 'sharing links (anti-link is on)');
    return true;
  }

  // Anti-spam: too many messages too fast.
  if (isSpamming(chatJid, sender)) {
    await deleteMessage(sock, chatJid, msg);
    await warn(sock, chatJid, sender, 'sending messages too fast');
    return true;
  }

  return false;
}

async function deleteMessage(sock, chatJid, msg) {
  try {
    await sock.sendMessage(chatJid, { delete: msg.key });
  } catch (err) {
    console.error('[mod] delete failed:', err.message);
  }
}

/** Add a warn; at the limit the member is removed from the group. */
async function warn(sock, groupJid, userJid, reason) {
  const settings = store.groupSettings(groupJid);
  const count = store.addWarn(groupJid, userJid);
  const limit = settings.warnLimit;
  if (count >= limit) {
    store.clearWarns(groupJid, userJid);
    if (await isBotAdmin(sock, groupJid)) {
      await sock.groupParticipantsUpdate(groupJid, [userJid], 'remove');
      await queue.enqueue(sock, groupJid, {
        text: `⛔ @${digits(userJid)} reached ${limit} warns (${reason}) and was removed.`,
        mentions: [userJid]
      });
    } else {
      await queue.enqueue(sock, groupJid, {
        text: `⛔ @${digits(userJid)} reached ${limit} warns (${reason}). I need admin rights to remove them.`,
        mentions: [userJid]
      });
    }
    return count;
  }
  await queue.enqueue(sock, groupJid, {
    text: `⚠️ @${digits(userJid)} warned (${count}/${limit}): ${reason}.`,
    mentions: [userJid]
  });
  return count;
}

// ---- commands (admin or owner only) ----

async function warnCmd(ctx, args) {
  const { sock, msg, chatJid } = ctx;
  const { resolveTarget } = require('./groups');
  const target = resolveTarget(msg, args);
  if (!target) throw new Error('Usage: .warn @user [reason]');
  const reason = args.slice(1).join(' ') || 'breaking group rules';
  await warn(sock, chatJid, target, reason);
}

async function unwarnCmd(ctx, args) {
  const { sock, msg, chatJid } = ctx;
  const { resolveTarget } = require('./groups');
  const target = resolveTarget(msg, args);
  if (!target) throw new Error('Usage: .unwarn @user');
  store.clearWarns(chatJid, target);
  await queue.enqueue(sock, chatJid, {
    text: `✅ Warns cleared for @${digits(target)}.`,
    mentions: [target]
  });
}

async function warningsCmd(ctx, args) {
  const { sock, msg, chatJid } = ctx;
  const { resolveTarget } = require('./groups');
  const target = resolveTarget(msg, args) || senderOf(msg);
  const count = store.getWarns(chatJid, target);
  const limit = store.groupSettings(chatJid).warnLimit;
  await queue.enqueue(sock, chatJid, {
    text: `⚠️ @${digits(target)} has ${count}/${limit} warns.`,
    mentions: [target]
  });
}

async function banCmd(ctx, args) {
  const { sock, msg, chatJid } = ctx;
  const { resolveTarget } = require('./groups');
  const target = resolveTarget(msg, args);
  if (!target) throw new Error('Usage: .ban @user (removes them from the group)');
  if (digits(target) === digits(sock.user.id)) throw new Error('I cannot remove myself.');
  if (!(await isBotAdmin(sock, chatJid))) throw new Error('I need to be a group admin to remove members.');
  await sock.groupParticipantsUpdate(chatJid, [target], 'remove');
  await queue.enqueue(sock, chatJid, {
    text: `⛔ @${digits(target)} was removed from the group.`,
    mentions: [target]
  });
}

module.exports = { moderate, warn, warnCmd, unwarnCmd, warningsCmd, banCmd };
