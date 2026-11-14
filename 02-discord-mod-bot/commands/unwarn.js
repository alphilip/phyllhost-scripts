// /unwarn and !unwarn — removes one warning by its list number (see /warnings).
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkPerms } = require('../lib/context');
const { logAction } = require('../lib/modlog');
const store = require('../lib/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unwarn')
    .setDescription('Remove one warning from a member.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName('user').setDescription('The member to un-warn.').setRequired(true))
    .addIntegerOption((o) => o.setName('number').setDescription('Warning number from /warnings.').setRequired(true).setMinValue(1)),

  prefix: { name: 'unwarn', usage: '!unwarn @user <number>', description: 'Remove a warning.' },

  async execute(ctx) {
    const denied = checkPerms(ctx, PermissionFlagsBits.KickMembers, null, 'Kick Members');
    if (denied) return ctx.reply({ content: denied, ephemeral: true });
    const target = await ctx.getTargetMember('user', 0);
    if (!target) return ctx.reply({ content: 'I could not find that member.', ephemeral: true });

    const number = ctx.isSlash ? ctx.interaction.options.getInteger('number') : Number(ctx.args[1]);
    if (!Number.isFinite(number) || number < 1) {
      return ctx.reply({ content: 'Give the warning number from /warnings.', ephemeral: true });
    }
    const removed = store.removeWarn(ctx.guild.id, target.id, number);
    if (!removed) {
      return ctx.reply({ content: `${target.user.tag} has no warning #${number}.`, ephemeral: true });
    }
    await logAction(ctx.guild, {
      action: 'unwarn',
      moderator: ctx.user,
      target: target.user,
      reason: `Removed warning #${number}: ${removed.reason}`,
    });
    return ctx.reply(`Removed warning #${number} from ${target.user.tag} ("${removed.reason}").`);
  },
};
