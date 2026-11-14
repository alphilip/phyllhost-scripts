// /warnings and !warnings — lists a member's warnings.
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('../lib/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription("Show a member's warnings.")
    .addUserOption((o) => o.setName('user').setDescription('The member to check (defaults to you).')),

  prefix: { name: 'warnings', usage: '!warnings [@user]', description: "Show a member's warnings." },

  async execute(ctx) {
    const target = (await ctx.getTargetMember('user', 0)) || ctx.member;
    const warns = store.getWarns(ctx.guild.id, target.id);
    if (warns.length === 0) {
      return ctx.reply(`${target.user.tag} has no warnings.`);
    }
    const embed = new EmbedBuilder()
      .setColor(0xecc94b)
      .setTitle(`Warnings — ${target.user.tag}`)
      .setDescription(
        warns
          .map((w, i) => `**#${i + 1}** — ${w.reason}\nBy ${w.moderatorTag} · <t:${Math.floor(new Date(w.date).getTime() / 1000)}:R>`)
          .join('\n\n'),
      )
      .setFooter({ text: `Total: ${warns.length} warning(s). Remove one with /unwarn.` });
    return ctx.reply({ embeds: [embed] });
  },
};
