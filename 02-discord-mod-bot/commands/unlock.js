// /unlock and !unlock — restores @everyone's send permission in a channel.
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { checkPerms } = require('../lib/context');
const { logAction } = require('../lib/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a channel so @everyone can send messages again.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to unlock (defaults to this one).').addChannelTypes(ChannelType.GuildText)),

  prefix: { name: 'unlock', usage: '!unlock', description: 'Unlock this channel.' },

  async execute(ctx) {
    const denied = checkPerms(ctx, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageChannels, 'Manage Channels');
    if (denied) return ctx.reply({ content: denied, ephemeral: true });

    const targetChannel = ctx.isSlash ? ctx.interaction.options.getChannel('channel') || ctx.channel : ctx.channel;
    await targetChannel.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: null });
    await logAction(ctx.guild, { action: 'unlock', moderator: ctx.user, target: null, reason: `#${targetChannel.name} unlocked` });
    return ctx.reply(`${targetChannel} is now unlocked.`);
  },
};
