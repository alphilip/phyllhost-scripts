# PhyllHost Scripts

Complete, full-featured scripts for terminal hosting — the standard bots
and services people run on a Node.js terminal, ready to clone and deploy.
Each folder is a self-contained, multi-file project: pick one, install it,
set its `.env`, and run it.

## Scripts

| Folder | What it does | Stack |
| --- | --- | --- |
| [01-whatsapp-bot](01-whatsapp-bot) | Complete Baileys WhatsApp bot: QR + pairing-code login, run from its own DM (Levanter-style self-commands), stickers, downloaders, AI chat, utilities, group tools, moderation, auto-replies, opt-in broadcast, paced send queue | Node.js + Baileys |
| [02-discord-mod-bot](02-discord-mod-bot) | Complete discord.js bot: slash + prefix commands, verify, kick/ban/timeout/warn, tickets with transcripts, auto-mod, levels/XP, welcome/goodbye | Node.js + discord.js |
| [03-telegram-notify-bot](03-telegram-notify-bot) | Complete Telegraf bot: subscribe/unsubscribe alerts, inline keyboards, daily digest, HTTP alert endpoint, media alerts, per-chat levels | Node.js + Telegraf + Express |
| [04-paystack-webhook](04-paystack-webhook) | Complete Paystack webhook handler: HMAC-SHA512 verification, all event types, idempotency, JSON logging, retry queue, /events list | Node.js + Express |
| [05-price-tracker](05-price-tracker) | Multi-target price tracker: targets.json, price history, drop + back-in-stock alerts, webhook alerts, polite crawling | Node.js + axios + cheerio |
| [06-scheduler](06-scheduler) | Complete job scheduler: log/webhook/shell jobs, cron validation, retries, run history, timezone support, status endpoint | Node.js + node-cron |

## Interactive Terminal Installer (1-Click / 1-Command)

Terminal users can launch the interactive template menu to pick, install, configure `.env`, and start any template:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/<your-username>/phyllhost-scripts/main/install.sh)
```

Or install a specific template directly by number or name:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/<your-username>/phyllhost-scripts/main/install.sh) 1
```

## Quick start

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/phyllhost-scripts.git
cd phyllhost-scripts

# 2. Pick a script, e.g. the WhatsApp bot
cd 01-whatsapp-bot

# 3. Install dependencies
npm install

# 4. Copy the example env file and fill in your own values
cp .env.example .env

# 5. Run it
node index.js
```

Each script folder has its own README with its full feature/command list
and its own setup steps.

## Running with pm2 (recommended for 24/7)

```bash
# Install pm2 once
npm install -g pm2

# Start one script from its folder
pm2 start index.js --name whatsapp-bot

# Or start everything from the repo root with the shared config
pm2 start ecosystem.config.js

# Useful commands
pm2 list
pm2 logs whatsapp-bot
pm2 restart whatsapp-bot
pm2 stop all
```

## Deploy notes

**Pterodactyl (Node.js egg):** create a server from a Node.js egg,
upload the script folder's files into the server root, set the
environment variables in the Startup tab, and start the server.
The bot keeps running as long as the server is started.

**Coolify:** create a Node.js app from this repo (or a Dockerfile app),
set the environment variables in the app's Environment Variables tab,
and deploy. Keep the `session/` and `data/` folders on a persistent
volume so logins and stored data survive redeploys.

## Safety note

These scripts are built for things you run on your own accounts and
your own services:

- The WhatsApp bot only **replies** to messages sent to it, plus
  opt-in broadcasts to people who subscribed — and it answers commands
  from its own number, so you run it from its own DM (Levanter-style:
  1:1 chats only, never groups, with a loop guard so its own replies
  never trigger it). It does not send bulk
  messages or message strangers. It has no view-once bypass, no
  anti-delete, and no auto status-viewing. Outbound sends go through
  one paced queue with a daily cap. Never use it to message strangers
  in bulk — that gets numbers banned.
- The price tracker is polite by default: it waits between checks and
  identifies itself. Only track pages you are allowed to check, and
  respect the site's `robots.txt` and terms of use.
- The scheduler only runs commands you put in `jobs.json` yourself.
  Only schedule commands you trust.
- Never commit a real `.env` file, token, or API key to Git. Keep
  secrets in environment variables only.

## License

MIT — see [LICENSE](LICENSE).
