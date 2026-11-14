# Telegram Notify Bot

A Telegraf bot that answers commands, keeps a list of subscribed chats,
and doubles as a notification relay: any other script can POST to it and
the message lands in Telegram — as text or as a photo. Once a day it
sends subscribers a digest of everything that came in.

## What it does

### Commands (everyone)

| Command | What it does |
| --- | --- |
| `/start` | Introduction + main menu buttons |
| `/help` | Full command list |
| `/menu` | Inline-keyboard main menu (Status, Subscribe, Unsubscribe, Help) |
| `/status` | Uptime, subscriber count, queued alerts, server time |
| `/subscribe` | This chat starts receiving alerts |
| `/unsubscribe` | This chat stops receiving alerts |
| `/level [all\|info\|important]` | Choose which alerts this chat gets (buttons if no argument) |

### Owner commands (only `OWNER_CHAT_ID`)

| Command | What it does |
| --- | --- |
| `/send <chat_id> <message>` | Send a message to any chat id |
| `/broadcast <message>` | Send an important alert to all subscribers (also queued for the digest) |
| `/stats` | Subscribers, queued alerts, uptime, digest schedule |
| `/digest` | Send today's digest immediately instead of waiting for the schedule |

### Alert levels

Alerts have a level: `info` or `important`. Each chat picks what it
wants to receive:

- `all` — every alert (default for new subscribers)
- `info` — info-level alerts only
- `important` — important-level alerts only

Set it with `/level` (or the **⚙️ Alert level** button in the menu).
The alert endpoint respects the setting when broadcasting.

### HTTP endpoints

- `GET /health` — `{ ok: true, uptimeSec, subscribers, queuedAlerts, time }`.
- `POST /alert` — forward an alert to Telegram.

```json
{
  "message": "Deployment finished",
  "level": "info"
}
```

- `chatId` (optional) — send to one chat instead of broadcasting.
- `level` (optional) — `"info"` (default) or `"important"`.
- `photoUrl` + `caption` (optional) — send a photo alert instead of text:

```json
{
  "photoUrl": "https://example.com/screenshot.png",
  "caption": "Daily chart",
  "level": "important"
}
```

Response: `{ ok: true, sent, failed, skipped, queuedForDigest }`.
If `ALERT_KEY` is set, send it as the `X-Alert-Key` header or the
endpoint answers `401`.

Broadcast alerts are queued and included in the next digest; alerts
sent to one `chatId` are not.

### Daily digest

Alerts received through `/alert` and `/broadcast` are queued in
`data/subscriptions.json`. Every day at 08:00 server time (or the cron
expression in `DIGEST_CRON`) the bot sends every subscribed chat a
summary grouped into **🚨 Important** and **ℹ️ Info**, then clears the
queue. Chats whose level filter matches none of the queued items are
skipped. The owner can force one early with `/digest`.

## Files

```
index.js                    entry point: bot, commands, callbacks, HTTP server
lib/
  store.js                  JSON persistence (subscriptions, settings, digest queue)
  settings.js               alert levels + level matching rules
  alerts.js                 sending, broadcasting, photo alerts, level filter
  digest.js                 digest text + node-cron schedule
  keyboard.js               inline keyboards (main menu, level picker)
data/
  subscriptions.json        created/updated automatically; never edit by hand
.env.example                copy to .env and fill in
```

## Setup

### 1. Create the bot with BotFather

1. Open Telegram and message **@BotFather**.
2. Send `/newbot`, pick a display name and a username ending in `bot`.
3. Copy the token BotFather gives you — that is `TELEGRAM_BOT_TOKEN`.
4. Open your new bot and press **Start** so it can message you.
5. Message **@userinfobot** to find your own chat id — that is
   `OWNER_CHAT_ID`.

### 2. Install and configure

```bash
npm install
cp .env.example .env
```

Edit `.env` and set `TELEGRAM_BOT_TOKEN` and `OWNER_CHAT_ID`.
Optionally set `ALERT_KEY` (a shared secret for `POST /alert`) and
`DIGEST_CRON` (default `0 8 * * *`, daily at 08:00).

## Run

```bash
node index.js
```

Test the alert endpoint from another terminal:

```bash
# Text alert to all subscribers
curl -X POST http://localhost:3000/alert \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from the alert endpoint", "level": "info"}'

# Photo alert to one chat
curl -X POST http://localhost:3000/alert \
  -H "Content-Type: application/json" \
  -d '{"photoUrl": "https://example.com/chart.png", "caption": "Daily chart", "chatId": "123456789"}'

# Health check
curl http://localhost:3000/health
```

With pm2 (keeps it running 24/7, restarts on crash):

```bash
pm2 start index.js --name telegram-notify
pm2 save
pm2 logs telegram-notify
```

## Deploy notes

- **Pterodactyl:** upload these files into a Node.js server's root,
  set the env vars (`TELEGRAM_BOT_TOKEN`, `OWNER_CHAT_ID`, `PORT`,
  `ALERT_KEY`, `DIGEST_CRON`) in the Startup tab, and start the server.
  Give the server an extra allocation if other scripts need to reach
  `/alert` from outside. The `data/` folder must be writable so
  subscriptions survive restarts — keep it inside the server's volume,
  not in a read-only path.
- **Coolify:** deploy as a Node.js app, set the same env vars in the
  app's environment settings, and add a persistent volume mounted at
  the app's `data/` directory so `subscriptions.json` is not lost on
  redeploy. Expose the app's port if other services need `/alert`; the
  bot itself only needs outbound access to Telegram.

## Security notes

- Never commit `.env` or share your bot token — anyone with it controls
  the bot. The repo's `.gitignore` already excludes `.env`.
- Set `ALERT_KEY` if `/alert` is reachable from the internet; without
  it, anyone who finds the URL can send messages as your bot.
- `data/subscriptions.json` contains chat ids — treat it as private
  data, not something to publish.
