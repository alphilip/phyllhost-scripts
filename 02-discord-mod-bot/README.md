# Discord Moderation Bot

A full-featured discord.js v14 bot for community servers: verification,
moderation with a mod log, support tickets with transcripts, auto-mod,
levels/XP, welcome/goodbye messages, and server utilities.

Every command works **two ways**: as a slash command (`/kick`) and as a
prefix command (`!kick`). Prefix defaults to `!` (change `PREFIX` in `.env`).

## Features

### Verification
- `/verify` / `!verify` — grants the configured Verified role to the caller.

### Moderation (user + bot both need the matching Discord permission)
- `/kick @user [reason]` / `!kick` — Kick Members
- `/ban @user [reason] [delete_days]` / `!ban` — Ban Members
- `/timeout @user <minutes> [reason]` / `!timeout` — Timeout Members (max 28 days)
- `/warn @user <reason>` / `!warn` — record a warning (Kick Members)
- `/unwarn @user <number>` / `!unwarn` — remove one warning
- `/warnings [@user]` / `!warnings` — list a member's warnings
- Every action above is written to the **mod-log channel** as an embed
  (moderator, target, reason, duration). Set it in `config.json`
  (`logChannelId`) or with `/config set log-channel #channel`.

### Tickets
- `/ticket [topic]` / `!ticket` — creates a private channel under the
  Tickets category, visible only to the opener (and the mod role, if set).
- `/close` / `!close` — or the **Close ticket** button in the ticket —
  writes a transcript (last 100 messages) to `transcripts/`, posts it to
  the mod-log channel, then deletes the channel after 5 seconds.

### Auto-mod
- **Bad-words filter** — deletes the message and warns the sender.
- **Invite-link blocking** — deletes `discord.gg/...` links and warns.
- **Spam detection** — more than 5 messages in 5 seconds deletes the
  messages and times the sender out for 10 minutes.
- Members with Manage Messages are exempt. Word list and thresholds live
  in `config.json` under `automod`. Every auto-mod action is logged.

### Levels / XP
- 15–25 XP per message (once per minute per user), level thresholds grow
  with each level. Level-up message in the channel.
- `/rank [@user]` / `!rank` — level, total XP, progress bar.
- `/leaderboard` / `!leaderboard` — top 10 members by XP.

### Welcome / goodbye
- New members get a welcome message, leavers a goodbye message, in the
  configured channels (falls back to the server's system channel).
- Messages support `{user}` and `{server}` placeholders.

### Utility
- `/serverinfo` / `!serverinfo` — members, channels, roles, boosts, owner.
- `/userinfo [@user]` / `!userinfo` — account age, join date, roles, timeout.
- `/purge <amount> [@user]` / `!purge` — bulk-delete 1–100 recent messages
  (Discord only allows messages under 14 days old).
- `/slowmode <seconds> [channel]` / `!slowmode` — 0–21600s, 0 turns it off.
- `/lock [channel]` / `!lock` — stops @everyone sending in a channel.
- `/unlock [channel]` / `!unlock` — restores sending.
- `/ping` / `!ping` — latency check.
- `/help` / `!help` — lists every command.
- `/config view` and `/config set <key> <value>` / `!config` — change
  per-server settings at runtime (Manage Server only). Keys:
  `log-channel`, `verified-role`, `welcome-channel`, `goodbye-channel`,
  `ticket-category`, `mod-role`. Saved to `data/guild-overrides.json`
  and beats `config.json`.

## Project layout

```text
index.js            Entry point: client setup, loads commands/ and events/
config.json         Guild settings (defaults + per-guild overrides)
.env.example        Env template — copy to .env and fill in
lib/
  context.js        Normalises slash + prefix into one command context
  guildConfig.js    Merges config.json + runtime overrides + .env fallbacks
  store.js          JSON storage: warnings, XP, tickets, overrides
  modlog.js         Sends moderation embeds to the log channel
  xp.js             Level thresholds and XP awards
  automod.js        Bad words, invite links, spam detection
  tickets.js        Ticket creation + transcript-on-close
commands/           One file per command (slash definition + prefix usage)
events/             ready, interactionCreate, messageCreate,
                    guildMemberAdd, guildMemberRemove
data/               Created at runtime: warns.json, xp.json, tickets.json,
                    guild-overrides.json (gitignored)
transcripts/        Ticket transcripts, one .txt per closed ticket
```

## Setup

### 1. Create the bot in the Discord Developer Portal

1. Go to <https://discord.com/developers/applications> and click
   **New Application**. Give it a name.
2. **General Information** — copy the **Application ID**; this is
   `CLIENT_ID` in `.env`.
3. **Bot** — click **Reset Token** and copy the token; this is
   `DISCORD_TOKEN`. Never share it or commit it.
4. On the same Bot page, turn on these **Privileged Gateway Intents**:
   - **Server Members Intent** (needed for welcome/goodbye and member lookups)
   - **Message Content Intent** (needed for `!` prefix commands, auto-mod and XP)
5. **OAuth2 → URL Generator** — scopes: `bot` and `applications.commands`;
   bot permissions: **Manage Roles, Kick Members, Ban Members, Moderate
   Members, Manage Channels, Manage Messages, Send Messages, Read Message
   History, Embed Links, Attach Files**. Open the generated URL, pick your
   server, and authorise.
6. In Discord, turn on **Developer Mode** (Settings → Advanced) so you can
   right-click servers/channels/roles and **Copy ID**.

### 2. Install and configure

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```ini
DISCORD_TOKEN=your-bot-token-here
CLIENT_ID=your-application-id-here
GUILD_ID=                    # optional: one server ID for instant slash commands
PREFIX=!
VERIFIED_ROLE_NAME=Verified
```

Create a `Verified` role in your server (or set a role ID with
`/config set verified-role @Verified` after the bot is running).
**Move the bot's role above the Verified role** in Server Settings →
Roles, or it cannot grant the role.

### 3. Configure per-server settings (optional)

Edit `config.json`: put your server ID under `guilds` and fill in
`logChannelId`, `verifiedRoleId`, `welcomeChannelId`, and the `automod`
word list. Anything left empty falls back to `defaults` and then `.env`.
You can also change settings live with `/config` — no restart needed.

## Run

```bash
node index.js
```

On first start the bot registers its slash commands: instantly in the
server set by `GUILD_ID`, or globally (can take up to 1 hour to appear
everywhere) when `GUILD_ID` is empty.

### Run with pm2 (keeps it running 24/7)

```bash
pm2 start index.js --name discord-mod
pm2 logs discord-mod
pm2 save
```

From the repo root, the shared ecosystem file also works:

```bash
pm2 start ecosystem.config.js --only discord-mod
```

## Deploy notes

- **Pterodactyl:** upload these files into a Node.js server's root,
  set `DISCORD_TOKEN` (and `CLIENT_ID`) in the server's Startup /
  Variables tab, and start the server. The bot only needs outbound
  internet to Discord's gateway — no ports need opening. `data/` and
  `transcripts/` are written inside the server files, so they persist
  across restarts on the same server.
- **Coolify:** deploy as a Node.js app from this folder and set the env
  vars (`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `PREFIX`) in the app's
  Environment Variables. No domain or port mapping is needed — the bot
  connects out to Discord, nothing connects in.
- **Do not commit `.env`**, `data/*.json`, or `transcripts/` — they hold
  your token and per-server state. `.gitignore` already excludes them.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Set DISCORD_TOKEN in your .env file first` | You ran without `.env`, or the token is still the placeholder. |
| Slash commands don't appear | `CLIENT_ID` missing (check the log), or wait up to 1 hour for global registration. Set `GUILD_ID` for instant registration while testing. |
| `!` commands do nothing | Message Content Intent is off in the Developer Portal, or the bot lacks Read Message History / Send Messages in that channel. |
| "I need the Manage Roles permission" / role not granted | Move the bot's role above the Verified role in Server Settings → Roles. |
| No welcome/mod-log messages | Set the channel IDs in `config.json` or with `/config`; the bot needs View Channel + Send Messages there. |
| Auto-mod doesn't trigger | The word list is in `config.json` → `automod.badWords`. Staff with Manage Messages are exempt by design. |
| XP not increasing | XP is awarded once per minute per user by design (`xp.cooldownSeconds`). |
