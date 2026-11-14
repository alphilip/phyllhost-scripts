// /ping and !ping — checks the bot is alive and shows latency.
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot is responding and see its latency.'),

  prefix: { name: 'ping', usage: '!ping', description: 'Check latency.' },

  async execute(ctx) {
    const sentAt = ctx.isSlash ? ctx.interaction.createdTimestamp : ctx.message.createdTimestamp;
    const reply = await ctx.reply('Pong! Measuring…');
    const roundTrip = Date.now() - sentAt;
    const text = `🏓 Pong! Round-trip: ${roundTrip}ms · WebSocket: ${Math.round(ctx.client.ws.ping)}ms`;
    if (ctx.isSlash) return ctx.interaction.editReply(text);
    return reply.edit(text);
  },
};
