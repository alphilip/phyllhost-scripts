// /slowmode and !slowmode — sets a per-user send delay on a channel (0 = off).
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { checkPerms } = require('../lib/context');
const { logAction } = require('../lib/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set a slowmode delay on a channel (0 to turn it off).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) => o.setName('seconds').setDescription('Delay in seconds (0–21600).').setRequired(true).setMinValue(0).setMaxValue(21600))
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to change (defaults to this one).').addChannelTypes(ChannelType.GuildText)),

  prefix: { name: 'slowmode', usage: '!slowmode <seconds>', description: 'Set slowmode on this channel.' },

  async execute(ctx) {
    const denied = checkPerms(ctx, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageChannels, 'Manage Channels');
    if (denied) return ctx.reply({ content: denied, ephemeral: true });

    const seconds = ctx.isSlash ? ctx.interaction.options.getInteger('seconds') : Number(ctx.args[0]);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 21600) {
      return ctx.reply({ content: 'Give a delay in seconds between 0 and 21600 (6 hours).', ephemeral: true });
    }
    const targetChannel = ctx.isSlash ? ctx.interaction.options.getChannel('channel') || ctx.channel : ctx.channel;
    await targetChannel.setRateLimitPerUser(seconds, `Slowmode set by ${ctx.user.tag}`);
    await logAction(ctx.guild, {
      action: 'slowmode',
      moderator: ctx.user,
      target: null,
      reason: `Slowmode ${seconds === 0 ? 'disabled' : `set to ${seconds}s`} in #${targetChannel.name}`,
    });
    return ctx.reply(seconds === 0 ? `Slowmode disabled in ${targetChannel}.` : `Slowmode set to ${seconds} second(s) in ${targetChannel}.`);
  },
};
