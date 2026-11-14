// /lock and !lock — stops @everyone from sending messages in a channel.
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { checkPerms } = require('../lib/context');
const { logAction } = require('../lib/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel so @everyone cannot send messages.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to lock (defaults to this one).').addChannelTypes(ChannelType.GuildText)),

  prefix: { name: 'lock', usage: '!lock', description: 'Lock this channel.' },

  async execute(ctx) {
    const denied = checkPerms(ctx, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageChannels, 'Manage Channels');
    if (denied) return ctx.reply({ content: denied, ephemeral: true });

    const targetChannel = ctx.isSlash ? ctx.interaction.options.getChannel('channel') || ctx.channel : ctx.channel;
    await targetChannel.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: false });
    await logAction(ctx.guild, { action: 'lock', moderator: ctx.user, target: null, reason: `#${targetChannel.name} locked` });
    return ctx.reply(`${targetChannel} is now locked. Use /unlock to open it again.`);
  },
};
