// /warn and !warn — records a warning against a member (stored in data/warns.json).
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkPerms } = require('../lib/context');
const { logAction } = require('../lib/modlog');
const store = require('../lib/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member. Warnings are stored and listed with /warnings.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName('user').setDescription('The member to warn.').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Why they are being warned.').setRequired(true)),

  prefix: { name: 'warn', usage: '!warn @user <reason>', description: 'Warn a member.' },

  async execute(ctx) {
    const denied = checkPerms(ctx, PermissionFlagsBits.KickMembers, null, 'Kick Members');
    if (denied) return ctx.reply({ content: denied, ephemeral: true });
    const target = await ctx.getTargetMember('user', 0);
    if (!target) return ctx.reply({ content: 'I could not find that member.', ephemeral: true });
    if (target.id === ctx.user.id) return ctx.reply({ content: 'You cannot warn yourself.', ephemeral: true });

    const reason = ctx.getReason('reason', 1);
    const entry = store.addWarn(ctx.guild.id, target.id, { reason, moderatorTag: ctx.user.tag });
    const total = store.getWarns(ctx.guild.id, target.id).length;
    await logAction(ctx.guild, {
      action: 'warn',
      moderator: ctx.user,
      target: target.user,
      reason,
      extra: [{ name: 'Total warnings', value: String(total) }],
    });
    return ctx.reply(`${target.user.tag} was warned (#${total}). Reason: ${reason}`);
  },
};
