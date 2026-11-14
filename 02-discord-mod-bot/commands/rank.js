// /rank and !rank — shows a member's level, XP and progress to the next level.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const store = require('../lib/store');
const { progressBar } = require('../lib/xp');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Show your (or another member\'s) level and XP.')
    .addUserOption((o) => o.setName('user').setDescription('The member to check (defaults to you).')),

  prefix: { name: 'rank', usage: '!rank [@user]', description: 'Show level and XP.' },

  async execute(ctx) {
    const target = (await ctx.getTargetMember('user', 0)) || ctx.member;
    const entry = store.getXp(ctx.guild.id, target.id);
    const { bar, intoLevel, needed } = progressBar(entry);
    const embed = new EmbedBuilder()
      .setColor(0x805ad5)
      .setAuthor({ name: target.user.tag, iconURL: target.user.displayAvatarURL() })
      .addFields(
        { name: 'Level', value: String(entry.level), inline: true },
        { name: 'Total XP', value: String(entry.xp), inline: true },
        { name: 'Progress', value: `${bar}\n${intoLevel} / ${needed} XP to level ${entry.level + 1}` },
      );
    return ctx.reply({ embeds: [embed] });
  },
};
