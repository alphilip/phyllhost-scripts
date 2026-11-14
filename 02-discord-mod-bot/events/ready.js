// Fires once when the bot logs in: registers slash commands and sets presence.
const { Events, REST, Routes, ActivityType } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`Logged in as ${client.user.tag} — moderation bot online.`);

    const commands = [...client.commands.values()].map((c) => c.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (!clientId) {
      console.warn('[ready] CLIENT_ID is not set — skipping slash-command registration. Set it in .env (Developer Portal > General Information).');
    } else {
      try {
        if (guildId) {
          await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
          console.log(`[ready] Registered ${commands.length} slash command(s) in guild ${guildId} (instant).`);
        } else {
          await rest.put(Routes.applicationCommands(clientId), { body: commands });
          console.log(`[ready] Registered ${commands.length} global slash command(s) (can take up to 1 hour to appear).`);
        }
      } catch (err) {
        console.error('[ready] Failed to register slash commands:', err.message);
      }
    }

    client.user.setPresence({
      activities: [{ name: '/help · !help', type: ActivityType.Listening }],
      status: 'online',
    });
  },
};
