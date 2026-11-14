// /verify and !verify — grants the configured Verified role to the caller.
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig } = require('../lib/guildConfig');
const { logAction } = require('../lib/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify yourself and get the Verified role.'),

  prefix: { name: 'verify', usage: '!verify', description: 'Get the Verified role.' },

  async execute(ctx) {
    const config = getGuildConfig(ctx.guild.id);
    let role = null;
    if (config.verifiedRoleId) {
      role = await ctx.guild.roles.fetch(config.verifiedRoleId).catch(() => null);
    }
    if (!role) {
      role = ctx.guild.roles.cache.find((r) => r.name === config.verifiedRoleName);
    }
    if (!role) {
      return ctx.reply(`No role named "${config.verifiedRoleName}" exists yet. Ask an admin to create it or set the verified role with /config.`);
    }
    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return ctx.reply('I need the **Manage Roles** permission to verify members.');
    }
    if (role.position >= ctx.guild.members.me.roles.highest.position) {
      return ctx.reply('My role must sit above the Verified role in the role list before I can grant it.');
    }
    if (ctx.member.roles.cache.has(role.id)) {
      return ctx.reply('You are already verified.');
    }
    await ctx.member.roles.add(role, 'Self-verification');
    await logAction(ctx.guild, { action: 'verify', moderator: ctx.user, target: ctx.user, reason: 'Self-verification' });
    return ctx.reply(`You are verified, ${ctx.user}. Welcome!`);
  },
};
