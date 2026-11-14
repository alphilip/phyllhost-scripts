// /purge and !purge — bulk-deletes recent messages (1–100).
// Discord only allows deleting messages younger than 14 days.
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkPerms } = require('../lib/context');
const { logAction } = require('../lib/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk-delete recent messages (1–100, under 14 days old).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) => o.setName('amount').setDescription('How many messages to delete.').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('user').setDescription('Only delete messages from this member.')),

  prefix: { name: 'purge', usage: '!purge <amount> [@user]', description: 'Bulk-delete messages.' },

  async execute(ctx) {
    const denied = checkPerms(ctx, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageMessages, 'Manage Messages');
    if (denied) return ctx.reply({ content: denied, ephemeral: true });

    const amount = ctx.isSlash ? ctx.interaction.options.getInteger('amount') : Number(ctx.args[0]);
    if (!Number.isFinite(amount) || amount < 1 || amount > 100) {
      return ctx.reply({ content: 'Give a number of messages between 1 and 100.', ephemeral: true });
    }
    const filterUser = ctx.isSlash
      ? ctx.interaction.options.getUser('user')
      : (await ctx.getTargetMember('user', 1))?.user || null;

    const fetched = await ctx.channel.messages.fetch({ limit: amount + (filterUser ? 50 : 1) });
    let toDelete = [...fetched.values()].filter((m) => !m.pinned);
    if (filterUser) toDelete = toDelete.filter((m) => m.author.id === filterUser.id);
    toDelete = toDelete.slice(0, amount);
    // Don't try to delete the command invocation itself for prefix use.
    if (!ctx.isSlash && ctx.message) toDelete = toDelete.filter((m) => m.id !== ctx.message.id);

    if (toDelete.length === 0) {
      return ctx.reply({ content: 'No deletable messages found (messages older than 14 days cannot be bulk-deleted).', ephemeral: true });
    }
    const deleted = await ctx.channel.bulkDelete(toDelete, true);
    await logAction(ctx.guild, {
      action: 'purge',
      moderator: ctx.user,
      target: null,
      reason: `Purged ${deleted.size} message(s) in #${ctx.channel.name}`,
    });
    const reply = await ctx.reply({ content: `Deleted ${deleted.size} message(s).`, ephemeral: true });
    return reply;
  },
};
