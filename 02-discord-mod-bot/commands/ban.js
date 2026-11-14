// /ban and !ban — bans a member. User and bot both need Ban Members.
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkPerms, checkHierarchy } = require('../lib/context');
const { logAction } = require('../lib/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName('user').setDescription('The member to ban.').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Why they are being banned.'))
    .addIntegerOption((o) => o.setName('delete_days').setDescription('Days of their messages to delete (0–7).').setMinValue(0).setMaxValue(7)),

  prefix: { name: 'ban', usage: '!ban @user [reason]', description: 'Ban a member.' },

  async execute(ctx) {
    const denied = checkPerms(ctx, PermissionFlagsBits.BanMembers, PermissionFlagsBits.BanMembers, 'Ban Members');
    if (denied) return ctx.reply({ content: denied, ephemeral: true });
    const target = await ctx.getTargetMember('user', 0);
    const hierarchy = checkHierarchy(ctx, target);
    if (hierarchy) return ctx.reply({ content: hierarchy, ephemeral: true });
    if (!target.bannable) return ctx.reply({ content: 'I cannot ban that member.', ephemeral: true });

    const reason = ctx.getReason('reason', 1);
    const deleteDays = ctx.isSlash ? (ctx.interaction.options.getInteger('delete_days') ?? 0) : 0;
    await ctx.guild.members.ban(target, { reason, deleteMessageSeconds: deleteDays * 86400 });
    await logAction(ctx.guild, {
      action: 'ban',
      moderator: ctx.user,
      target: target.user,
      reason,
      extra: deleteDays ? [{ name: 'Messages deleted', value: `${deleteDays} day(s)` }] : [],
    });
    return ctx.reply(`${target.user.tag} was banned. Reason: ${reason}`);
  },
};
