// /kick and !kick — kicks a member. User and bot both need Kick Members.
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkPerms, checkHierarchy } = require('../lib/context');
const { logAction } = require('../lib/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName('user').setDescription('The member to kick.').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Why they are being kicked.')),

  prefix: { name: 'kick', usage: '!kick @user [reason]', description: 'Kick a member.' },

  async execute(ctx) {
    const denied = checkPerms(ctx, PermissionFlagsBits.KickMembers, PermissionFlagsBits.KickMembers, 'Kick Members');
    if (denied) return ctx.reply({ content: denied, ephemeral: true });
    const target = await ctx.getTargetMember('user', 0);
    const hierarchy = checkHierarchy(ctx, target);
    if (hierarchy) return ctx.reply({ content: hierarchy, ephemeral: true });
    if (!target.kickable) return ctx.reply({ content: 'I cannot kick that member.', ephemeral: true });

    const reason = ctx.getReason('reason', 1);
    await target.kick(reason);
    await logAction(ctx.guild, { action: 'kick', moderator: ctx.user, target: target.user, reason });
    return ctx.reply(`${target.user.tag} was kicked. Reason: ${reason}`);
  },
};
