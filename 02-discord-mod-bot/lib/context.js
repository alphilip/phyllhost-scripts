// Normalises slash interactions and prefix messages into one context object,
// so every command is written once and works both ways.
const { PermissionsBitField } = require('discord.js');

function createContext({ client, interaction = null, message = null, args = [] }) {
  const isSlash = Boolean(interaction);
  const guild = interaction?.guild ?? message?.guild ?? null;
  const channel = interaction?.channel ?? message?.channel ?? null;
  const member = interaction?.member ?? message?.member ?? null;
  const user = interaction?.user ?? message?.author ?? null;

  async function reply(payload) {
    const data = typeof payload === 'string' ? { content: payload } : payload;
    if (isSlash) {
      if (interaction.deferred || interaction.replied) return interaction.followUp(data);
      return interaction.reply(data);
    }
    // Prefix replies are normal channel messages: `ephemeral` is not valid there.
    const { ephemeral: _ephemeral, ...rest } = data;
    return message.reply(rest);
  }

  // Resolve the command target: slash option "user" or a prefix mention / ID / username.
  async function getTargetMember(optionName = 'user', argIndex = 0) {
    if (isSlash) return interaction.options.getMember(optionName);
    const raw = args[argIndex];
    if (!raw) return null;
    const id = raw.replace(/[<@!>]/g, '');
    return guild.members.fetch(id).catch(() => {
      const query = raw.toLowerCase();
      return guild.members.cache.find(
        (m) => m.user.username.toLowerCase() === query || m.user.tag.toLowerCase() === query,
      ) || null;
    });
  }

  function getReason(optionName = 'reason', argIndex = 1) {
    if (isSlash) return interaction.options.getString(optionName) || `By ${user.tag}`;
    return args.slice(argIndex).join(' ') || `By ${user.tag}`;
  }

  return { client, isSlash, interaction, message, guild, channel, member, user, args, reply, getTargetMember, getReason };
}

// Checks a permission for the invoking user AND the bot. Returns an error
// string to show the user, or null when both sides pass.
function checkPerms(ctx, userFlag, botFlag, label) {
  const flagName = Object.keys(PermissionsBitField.Flags).find(
    (k) => PermissionsBitField.Flags[k] === userFlag,
  );
  const name = label || flagName || 'that permission';
  if (userFlag && !ctx.member.permissions.has(userFlag)) {
    return `You need the **${name}** permission to use this command.`;
  }
  if (botFlag && !ctx.guild.members.me.permissions.has(botFlag)) {
    return `I need the **${name}** permission to do that. Give my role that permission and try again.`;
  }
  return null;
}

// The bot can only act on members below its own highest role.
function checkHierarchy(ctx, target) {
  if (!target) return 'I could not find that member.';
  if (target.id === ctx.guild.ownerId) return 'I cannot moderate the server owner.';
  if (target.id === ctx.user.id) return 'You cannot use this command on yourself.';
  if (ctx.member.id !== ctx.guild.ownerId && target.roles.highest.position >= ctx.member.roles.highest.position) {
    return 'That member has a role equal to or higher than yours.';
  }
  if (target.roles.highest.position >= ctx.guild.members.me.roles.highest.position) {
    return 'That member has a role equal to or higher than mine — move my role above theirs.';
  }
  return null;
}

module.exports = { createContext, checkPerms, checkHierarchy };
