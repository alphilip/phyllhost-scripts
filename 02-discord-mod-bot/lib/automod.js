// Auto-mod: bad-words filter, invite-link blocking, spam detection.
// Returns { action: 'delete' | 'warn' | 'timeout', reason } or null.
// Staff (members with Manage Messages) are exempt.
const { PermissionsBitField } = require('discord.js');

const INVITE_REGEX = /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[\w-]+/i;

// userId -> array of message timestamps (ms) in the current window.
const recentMessages = new Map();

function hasBadWord(content, badWords) {
  const lower = content.toLowerCase();
  return (badWords || []).find((word) => {
    if (!word) return false;
    const escaped = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(lower);
  }) || null;
}

function isSpamming(userId, config) {
  const spam = config.automod.spam;
  if (!spam.enabled) return false;
  const now = Date.now();
  const windowMs = spam.windowSeconds * 1000;
  const history = (recentMessages.get(userId) || []).filter((t) => now - t < windowMs);
  history.push(now);
  recentMessages.set(userId, history);
  return history.length > spam.maxMessages;
}

function checkMessage(message, config) {
  const automod = config.automod || {};
  if (!automod.enabled) return null;
  if (message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) return null;

  const badWord = hasBadWord(message.content, automod.badWords);
  if (badWord) {
    return { action: 'warn', reason: `Used a blocked word ("${badWord}")`, deleteMessage: true };
  }

  if (automod.blockInvites && INVITE_REGEX.test(message.content)) {
    return { action: 'warn', reason: 'Posted a Discord invite link', deleteMessage: true };
  }

  if (isSpamming(message.author.id, config)) {
    return {
      action: 'timeout',
      reason: `Spam: more than ${config.automod.spam.maxMessages} messages in ${config.automod.spam.windowSeconds}s`,
      deleteMessage: true,
      timeoutMinutes: config.automod.spam.timeoutMinutes,
    };
  }

  return null;
}

module.exports = { checkMessage };
