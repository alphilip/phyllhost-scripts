// Discord moderation bot (discord.js v14) — entry point.
// Loads every command from ./commands and every event from ./events,
// then logs in. Slash commands are registered on ready (see events/ready.js).
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN || TOKEN === 'PASTE_YOUR_DISCORD_BOT_TOKEN_HERE') {
  console.error('Set DISCORD_TOKEN in your .env file first (copy .env.example to .env).');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

// Load commands: each file exports { data, prefix, execute }.
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (!command.data || !command.execute) {
    console.warn(`[load] Skipping commands/${file}: missing data or execute.`);
    continue;
  }
  client.commands.set(command.data.name, command);
}

// Load events: each file exports { name, once?, execute }.
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (!event.name || !event.execute) {
    console.warn(`[load] Skipping events/${file}: missing name or execute.`);
    continue;
  }
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

console.log(`[load] ${client.commands.size} command(s), ${fs.readdirSync(eventsPath).length} event file(s).`);

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

client.login(TOKEN);
