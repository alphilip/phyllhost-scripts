// /userinfo and !userinfo — facts about a member (or yourself).
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show information about a member.')
    .addUserOption((o) => o.setName('user').setDescription('The member to check (defaults to you).')),

  prefix: { name: 'userinfo', usage: '!userinfo [@user]', description: 'Show member info.' },

  async execute(ctx) {
    const target = (await ctx.getTargetMember('user', 0)) || ctx.member;
    const user = target.user;
    const roles = target.roles.cache
      .filter((r) => r.id !== ctx.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => r.toString());
    const embed = new EmbedBuilder()
      .setColor(0x3182ce)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'User ID', value: user.id, inline: true },
        { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
        { name: 'Account created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`, inline: true },
        { name: 'Joined server', value: target.joinedTimestamp ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>` : 'Unknown', inline: true },
        { name: 'Timed out until', value: target.communicationDisabledUntilTimestamp ? `<t:${Math.floor(target.communicationDisabledUntilTimestamp / 1000)}:R>` : 'Not timed out', inline: true },
        { name: `Roles (${roles.length})`, value: roles.slice(0, 15).join(' ') || 'None' },
      );
    return ctx.reply({ embeds: [embed] });
  },
};
