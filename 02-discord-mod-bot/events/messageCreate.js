// Runs on every message, in order: auto-mod -> XP -> prefix commands.
// Bots and DMs are ignored.
const { Events } = require('discord.js');
const { createContext } = require('../lib/context');
const { getGuildConfig, fill } = require('../lib/guildConfig');
const { checkMessage } = require('../lib/automod');
const { awardXp } = require('../lib/xp');
const { addWarn } = require('../lib/store');
const { logAction } = require('../lib/modlog');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;
    const config = getGuildConfig(message.guild.id);
    const prefix = process.env.PREFIX || '!';

    // --- Auto-mod (runs on every message, including commands) ---
    const hit = checkMessage(message, config);
    if (hit) {
      if (hit.deleteMessage) await message.delete().catch(() => {});
      if (hit.action === 'warn') {
        addWarn(message.guild.id, message.author.id, { reason: `Auto-mod: ${hit.reason}`, moderatorTag: 'Auto-mod' });
        await logAction(message.guild, { action: 'warn', moderator: client.user, target: message.author, reason: `Auto-mod: ${hit.reason}` });
        await message.channel.send(`${message.author}, your message was removed: ${hit.reason}.`).catch(() => {});
      } else if (hit.action === 'timeout') {
        const member = message.member;
        if (member?.moderatable) {
          await member.timeout(hit.timeoutMinutes * 60 * 1000, `Auto-mod spam: ${hit.reason}`).catch(() => {});
        }
        await logAction(message.guild, {
          action: 'timeout',
          moderator: client.user,
          target: message.author,
          reason: `Auto-mod: ${hit.reason}`,
          extra: [{ name: 'Duration', value: `${hit.timeoutMinutes} minute(s)` }],
        });
        await message.channel.send(`${message.author} was timed out for ${hit.timeoutMinutes} minute(s) for spamming.`).catch(() => {});
      }
      return; // A flagged message never earns XP or runs as a command.
    }

    // --- XP / levels ---
    const result = awardXp(message.guild.id, message.author.id, config);
    if (result?.leveledUp) {
      const text = fill(config.xp.levelUpMessage, { user: `${message.author}`, level: result.level });
      await message.channel.send(text).catch(() => {});
    }

    // --- Prefix commands ---
    if (!message.content.startsWith(prefix)) return;
    const [name, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
    if (!name) return;
    const command = client.commands.get(name.toLowerCase())
      || [...client.commands.values()].find((c) => c.prefix?.name === name.toLowerCase());
    if (!command) return;

    try {
      const ctx = createContext({ client, message, args });
      await command.execute(ctx);
    } catch (err) {
      console.error('[prefix] error:', err);
      await message.reply('Something went wrong running that command.').catch(() => {});
    }
  },
};
