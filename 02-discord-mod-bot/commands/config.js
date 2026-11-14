// /config and !config — view or change this server's settings at runtime.
// Settings are saved to data/guild-overrides.json and beat config.json.
// Only members with Manage Server can use it.
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { checkPerms } = require('../lib/context');
const { getGuildConfig } = require('../lib/guildConfig');
const store = require('../lib/store');

const KEYS = {
  'log-channel': { storeKey: 'logChannelId', label: 'Mod-log channel', kind: 'channel' },
  'verified-role': { storeKey: 'verifiedRoleId', label: 'Verified role', kind: 'role' },
  'welcome-channel': { storeKey: 'welcomeChannelId', label: 'Welcome channel', kind: 'channel' },
  'goodbye-channel': { storeKey: 'goodbyeChannelId', label: 'Goodbye channel', kind: 'channel' },
  'ticket-category': { storeKey: 'ticketCategoryId', label: 'Ticket category', kind: 'category' },
  'mod-role': { storeKey: 'modRoleId', label: 'Moderator role (can see tickets)', kind: 'role' },
};

function parseId(raw) {
  return String(raw || '').replace(/[<@!#&>]/g, '');
}

function describe(config) {
  const mention = (kind, id) => {
    if (!id) return 'not set';
    if (kind === 'channel') return `<#${id}>`;
    if (kind === 'role') return `<@&${id}>`;
    return id;
  };
  return Object.entries(KEYS)
    .map(([key, def]) => `**${key}** — ${mention(def.kind, config[def.storeKey])}`)
    .join('\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('View or change this server\'s bot settings.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('view').setDescription('Show the current settings for this server.'))
    .addSubcommand((s) => s
      .setName('set')
      .setDescription('Change one setting.')
      .addStringOption((o) => o.setName('key').setDescription('Which setting to change.').setRequired(true)
        .addChoices(...Object.keys(KEYS).map((k) => ({ name: k, value: k }))))
      .addStringOption((o) => o.setName('value').setDescription('Channel/role mention or ID.').setRequired(true))),

  prefix: { name: 'config', usage: '!config view | !config set <key> <channel/role mention or ID>', description: 'View or change server settings.' },

  async execute(ctx) {
    const denied = checkPerms(ctx, PermissionFlagsBits.ManageGuild, null, 'Manage Server');
    if (denied) return ctx.reply({ content: denied, ephemeral: true });

    const sub = ctx.isSlash ? ctx.interaction.options.getSubcommand() : (ctx.args[0] || 'view').toLowerCase();
    if (sub === 'view') {
      const config = getGuildConfig(ctx.guild.id);
      const embed = new EmbedBuilder()
        .setColor(0x3182ce)
        .setTitle(`Settings — ${ctx.guild.name}`)
        .setDescription(describe(config))
        .setFooter({ text: 'Change one with /config set <key> <value>. Values are saved per server.' });
      return ctx.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub !== 'set') {
      return ctx.reply({ content: 'Usage: `/config view` or `/config set <key> <value>`.', ephemeral: true });
    }
    const key = ctx.isSlash ? ctx.interaction.options.getString('key') : ctx.args[1];
    const rawValue = ctx.isSlash ? ctx.interaction.options.getString('value') : ctx.args[2];
    const def = KEYS[key];
    if (!def) {
      return ctx.reply({ content: `Unknown setting "${key}". Choices: ${Object.keys(KEYS).join(', ')}.`, ephemeral: true });
    }
    const id = parseId(rawValue);
    if (!/^\d{15,25}$/.test(id)) {
      return ctx.reply({ content: 'Give a channel/role mention or a numeric ID.', ephemeral: true });
    }
    store.setOverride(ctx.guild.id, def.storeKey, id);
    return ctx.reply({ content: `✅ ${def.label} set to ${def.kind === 'channel' ? `<#${id}>` : def.kind === 'role' ? `<@&${id}>` : id}.`, ephemeral: true });
  },
};
