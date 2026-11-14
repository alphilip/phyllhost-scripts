// /serverinfo and !serverinfo — facts about this server.
const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show information about this server.'),

  prefix: { name: 'serverinfo', usage: '!serverinfo', description: 'Show server info.' },

  async execute(ctx) {
    const guild = ctx.guild;
    const owner = await guild.fetchOwner().catch(() => null);
    const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
    const embed = new EmbedBuilder()
      .setColor(0x3182ce)
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL() || null)
      .addFields(
        { name: 'Server ID', value: guild.id, inline: true },
        { name: 'Owner', value: owner ? owner.user.tag : 'Unknown', inline: true },
        { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        { name: 'Members', value: String(guild.memberCount), inline: true },
        { name: 'Channels', value: `${textChannels} text · ${voiceChannels} voice`, inline: true },
        { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
        { name: 'Boosts', value: `Level ${guild.premiumTier} · ${guild.premiumSubscriptionCount || 0} boosts`, inline: true },
      );
    return ctx.reply({ embeds: [embed] });
  },
};
