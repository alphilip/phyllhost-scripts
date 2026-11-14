// /ticket and !ticket — opens a private support channel for the caller.
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createTicket } = require('../lib/tickets');
const { getGuildConfig } = require('../lib/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Open a private support ticket.')
    .addStringOption((o) => o.setName('topic').setDescription('What do you need help with?')),

  prefix: { name: 'ticket', usage: '!ticket [topic]', description: 'Open a private support ticket.' },

  async execute(ctx) {
    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return ctx.reply({ content: 'I need the **Manage Channels** permission to create tickets.', ephemeral: true });
    }
    const config = getGuildConfig(ctx.guild.id);
    const topic = ctx.isSlash
      ? ctx.interaction.options.getString('topic') || 'General support'
      : ctx.args.join(' ') || 'General support';
    const channel = await createTicket(ctx.guild, ctx.user, topic, config);
    return ctx.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
  },
};
