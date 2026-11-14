// /close and !close — closes the current ticket, saves a transcript file,
// sends it to the mod-log channel, then deletes the channel.
const { SlashCommandBuilder } = require('discord.js');
const { closeTicket } = require('../lib/tickets');
const store = require('../lib/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close this ticket and save a transcript.'),

  prefix: { name: 'close', usage: '!close', description: 'Close this ticket.' },

  async execute(ctx) {
    if (!store.getTicket(ctx.channel.id)) {
      return ctx.reply({ content: 'This is not a ticket channel.', ephemeral: true });
    }
    await ctx.reply('Closing this ticket — saving the transcript…');
    await closeTicket(ctx.channel, ctx.user);
  },
};
