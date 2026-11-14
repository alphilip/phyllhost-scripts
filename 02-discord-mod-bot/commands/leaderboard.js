// /leaderboard and !leaderboard — top 10 members by XP in this server.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const store = require('../lib/store');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top 10 members by XP in this server.'),

  prefix: { name: 'leaderboard', usage: '!leaderboard', description: 'Top 10 members by XP.' },

  async execute(ctx) {
    const top = store.getLeaderboard(ctx.guild.id, 10);
    if (top.length === 0) {
      return ctx.reply('Nobody has earned XP yet — send some messages to get started.');
    }
    const lines = [];
    for (let i = 0; i < top.length; i++) {
      const member = await ctx.guild.members.fetch(top[i].userId).catch(() => null);
      const name = member ? member.user.tag : `Unknown user (${top[i].userId})`;
      const medal = MEDALS[i] || `#${i + 1}`;
      lines.push(`${medal} **${name}** — Level ${top[i].level} · ${top[i].xp} XP`);
    }
    const embed = new EmbedBuilder()
      .setColor(0x805ad5)
      .setTitle(`🏆 XP Leaderboard — ${ctx.guild.name}`)
      .setDescription(lines.join('\n'));
    return ctx.reply({ embeds: [embed] });
  },
};
