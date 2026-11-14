// Ticket helpers: create the private channel, and close it with a transcript.
const fs = require('node:fs');
const path = require('node:path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionsBitField } = require('discord.js');
const store = require('./store');
const { logAction } = require('./modlog');

const TRANSCRIPTS_DIR = path.join(__dirname, '..', 'transcripts');

async function createTicket(guild, opener, topic, config) {
  let category = null;
  if (config.ticketCategoryId) {
    category = await guild.channels.fetch(config.ticketCategoryId).catch(() => null);
  }
  if (!category) {
    const categoryName = config.ticketCategoryName || 'Tickets';
    category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === categoryName,
    );
    if (!category) {
      category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });
    }
  }

  const channelName = `ticket-${opener.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90) || 'ticket';
  const overwrites = [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: opener.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
    },
  ];
  if (config.modRoleId) {
    overwrites.push({
      id: config.modRoleId,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `${topic} — opened by ${opener.tag}`,
    permissionOverwrites: overwrites,
  });

  store.setTicket(channel.id, { ownerId: opener.id, guildId: guild.id, topic, openedAt: new Date().toISOString() });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket-close').setLabel('Close ticket').setStyle(ButtonStyle.Danger),
  );
  await channel.send({
    content: `${opener}, your ticket is open. Describe your issue and staff will reply.`,
    embeds: [new EmbedBuilder().setColor(0x3182ce).setTitle('Support ticket').addFields({ name: 'Topic', value: topic }, { name: 'Opened by', value: opener.tag })],
    components: [closeRow],
  });

  await logAction(guild, { action: 'ticket', moderator: opener, target: opener, reason: `Ticket opened: ${topic}` });
  return channel;
}

async function closeTicket(channel, closedBy) {
  const ticket = store.getTicket(channel.id);
  const guild = channel.guild;

  // Build a transcript from the channel's recent messages.
  const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const lines = fetched
    ? [...fetched.values()].reverse().map((m) => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || '[attachment/embed]'}`)
    : ['(Could not fetch messages for this transcript.)'];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${channel.name}-${stamp}.txt`;
  fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
  const filePath = path.join(TRANSCRIPTS_DIR, fileName);
  fs.writeFileSync(filePath, `Ticket transcript — #${channel.name}\nOpened by: ${ticket ? ticket.ownerId : 'unknown'}\nTopic: ${ticket ? ticket.topic : 'unknown'}\nClosed by: ${closedBy.tag}\n\n${lines.join('\n')}\n`);

  await logAction(guild, {
    action: 'ticket-close',
    moderator: closedBy,
    target: ticket ? { toString: () => `<@${ticket.ownerId}>`, id: ticket.ownerId } : closedBy,
    reason: `Ticket #${channel.name} closed`,
    extra: [{ name: 'Transcript', value: fileName }],
  });

  // Attach the transcript to the log channel as well, when one is configured.
  const { getGuildConfig } = require('./guildConfig');
  const config = getGuildConfig(guild.id);
  if (config.logChannelId) {
    const logChannel = await guild.channels.fetch(config.logChannelId).catch(() => null);
    if (logChannel?.isTextBased()) {
      await logChannel.send({ content: `Transcript for #${channel.name}:`, files: [filePath] }).catch(() => {});
    }
  }

  store.removeTicket(channel.id);
  await channel.send('This ticket is closing — transcript saved.').catch(() => {});
  setTimeout(() => channel.delete('Ticket closed').catch(() => {}), 5000);
  return fileName;
}

module.exports = { createTicket, closeTicket };
