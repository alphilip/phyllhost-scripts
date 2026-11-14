// Welcomes new members in the configured welcome channel.
const { Events } = require('discord.js');
const { getGuildConfig, fill } = require('../lib/guildConfig');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    const config = getGuildConfig(member.guild.id);
    let channel = null;
    if (config.welcomeChannelId) {
      channel = await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
    }
    if (!channel) channel = member.guild.systemChannel;
    if (!channel?.isTextBased()) return;
    const text = fill(config.welcomeMessage, { user: `${member}`, server: member.guild.name });
    await channel.send(text).catch(() => {});
  },
};
