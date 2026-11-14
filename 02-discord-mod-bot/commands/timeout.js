// /timeout and !timeout — times a member out (mute). Max 28 days (Discord limit).
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkPerms, checkHierarchy } = require('../lib/context');
const { logAction } = require('../lib/modlog');

const MAX_MINUTES = 40320; // 28 days

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Time a member out (they cannot send messages or speak).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('user').setDescription('The member to time out.').setRequired(true))
    .addIntegerOption((o) => o.setName('minutes').setDescription('How long, in minutes (1–40320).').setRequired(true).setMinValue(1).setMaxValue(MAX_MINUTES))
    .addStringOption((o) => o.setName('reason').setDescription('Why they are being timed out.')),

  prefix: { name: 'timeout', usage: '!timeout @user <minutes> [reason]', description: 'Time a member out.' },

  async execute(ctx) {
    const denied = checkPerms(ctx, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ModerateMembers, 'Timeout Members');
    if (denied) return ctx.reply({ content: denied, ephemeral: true });
    const target = await ctx.getTargetMember('user', 0);
    const hierarchy = checkHierarchy(ctx, target);
    if (hierarchy) return ctx.reply({ content: hierarchy, ephemeral: true });
    if (!target.moderatable) return ctx.reply({ content: 'I cannot time out that member.', ephemeral: true });

    const minutes = ctx.isSlash
      ? ctx.interaction.options.getInteger('minutes')
      : Number(ctx.args[1]);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
      return ctx.reply({ content: `Give a duration in minutes between 1 and ${MAX_MINUTES} (28 days).`, ephemeral: true });
    }
    const reason = ctx.isSlash ? ctx.getReason('reason', 2) : ctx.args.slice(2).join(' ') || `By ${ctx.user.tag}`;
    await target.timeout(minutes * 60 * 1000, reason);
    await logAction(ctx.guild, {
      action: 'timeout',
      moderator: ctx.user,
      target: target.user,
      reason,
      extra: [{ name: 'Duration', value: `${minutes} minute(s)` }],
    });
    return ctx.reply(`${target.user.tag} was timed out for ${minutes} minute(s). Reason: ${reason}`);
  },
};
