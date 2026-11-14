// Handles slash commands and the ticket "Close ticket" button.
const { Events, PermissionFlagsBits } = require('discord.js');
const { createContext } = require('../lib/context');
const { closeTicket } = require('../lib/tickets');
const store = require('../lib/store');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        const ctx = createContext({ client, interaction });
        await command.execute(ctx);
        return;
      }

      if (interaction.isButton() && interaction.customId === 'ticket-close') {
        if (!store.getTicket(interaction.channel.id)) {
          return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
        }
        const ticket = store.getTicket(interaction.channel.id);
        const isOwner = ticket.ownerId === interaction.user.id;
        const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
        if (!isOwner && !isStaff) {
          return interaction.reply({ content: 'Only the ticket owner or staff can close this ticket.', ephemeral: true });
        }
        await interaction.reply('Closing this ticket — saving the transcript…');
        await closeTicket(interaction.channel, interaction.user);
      }
    } catch (err) {
      console.error('[interaction] error:', err);
      const message = 'Something went wrong running that command.';
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
        } else {
          await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
        }
      }
    }
  },
};
