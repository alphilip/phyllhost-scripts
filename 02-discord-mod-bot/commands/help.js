// /help and !help — lists every command with its slash and prefix usage.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all commands.'),

  prefix: { name: 'help', usage: '!help', description: 'List all commands.' },

  async execute(ctx) {
    const commands = [...ctx.client.commands.values()].sort((a, b) => a.data.name.localeCompare(b.data.name));
    const lines = commands.map((c) => {
      const prefixUsage = c.prefix?.usage ? ` \`${c.prefix.usage}\`` : '';
      return `**/${c.data.name}** — ${c.data.description}${prefixUsage}`;
    });
    const embed = new EmbedBuilder()
      .setColor(0x3182ce)
      .setTitle('🤖 Discord Mod Bot — commands')
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Slash commands and ! prefix commands both work. Moderation commands need the matching Discord permission.' });
    return ctx.reply({ embeds: [embed] });
  },
};
