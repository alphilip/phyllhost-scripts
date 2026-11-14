// Sends moderation records to the guild's configured mod-log channel.
const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('./guildConfig');

const ACTION_COLOURS = {
  kick: 0xed8936,
  ban: 0xe53e3e,
  unban: 0x38a169,
  timeout: 0xdd6b20,
  untimeout: 0x38a169,
  warn: 0xecc94b,
  unwarn: 0x38a169,
  purge: 0x805ad5,
  slowmode: 0x3182ce,
  lock: 0x718096,
  unlock: 0x38a169,
  ticket: 0x3182ce,
  'ticket-close': 0x718096,
  verify: 0x38a169,
};

async function logAction(guild, { action, moderator, target, reason, extra = [] }) {
  const config = getGuildConfig(guild.id);
  if (!config.logChannelId) return false;
  const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return false;

  const embed = new EmbedBuilder()
    .setColor(ACTION_COLOURS[action] || 0x718096)
    .setTitle(`Mod log — ${action}`)
    .addFields(
      { name: 'Moderator', value: `${moderator} (${moderator.id})`, inline: true },
      { name: 'Target', value: target ? `${target} (${target.id || target})` : '—', inline: true },
      { name: 'Reason', value: reason || 'No reason given' },
      ...extra,
    )
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
  return true;
}

module.exports = { logAction };
