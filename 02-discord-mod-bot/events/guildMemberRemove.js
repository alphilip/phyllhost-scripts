// Says goodbye when a member leaves, in the configured goodbye channel.
const { Events } = require('discord.js');
const { getGuildConfig, fill } = require('../lib/guildConfig');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member, client) {
    const config = getGuildConfig(member.guild.id);
    let channel = null;
    if (config.goodbyeChannelId) {
      channel = await member.guild.channels.fetch(config.goodbyeChannelId).catch(() => null);
    }
    if (!channel) channel = member.guild.systemChannel;
    if (!channel?.isTextBased()) return;
    const text = fill(config.goodbyeMessage, { user: member.user.tag, server: member.guild.name });
    await channel.send(text).catch(() => {});
  },
};
