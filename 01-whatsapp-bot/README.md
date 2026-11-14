# WhatsApp Bot

A full-featured WhatsApp bot built on [Baileys](https://github.com/WhiskeySockets/Baileys)
(`@whiskeysockets/baileys` ^6.7.18): stickers, downloaders, AI chat, utilities,
group tools, moderation, auto-replies — with a paced send queue so the number
stays safe.

## Features

| Area | Commands |
| --- | --- |
| General | `.menu` / `.help`, `.ping`, `.info`, `.subscribe`, `.unsubscribe` |
| Stickers | `.sticker` (image/video → webp), `.toimg` (sticker → png) |
| Downloaders | `.dl <url>` (video, max ~50 MB), `.dlmp3 <url>` (audio only) |
| AI chat | `.ai <prompt>` — Groq → Gemini → free fallback (env keys, graceful when unset) |
| Utilities | `.qr <text>`, `.wiki <topic>`, `.calc <expression>` (safe parser, no `eval`), `.translate <lang> <text>` |
| Group tools (admins) | `.tagall`, `.hidetag`, `.promote`, `.demote`, `.kick`, `.mute`, `.unmute`, `.antilink on\|off`, `.welcome on\|off`, `.groupinfo` |
| Moderation (admins) | `.warn`, `.unwarn`, `.warnings`, `.ban` — 3 warns (configurable) then removed; anti-link + anti-spam run automatically |
| Auto-replies | Keyword replies (configurable in `.env` defaults + `.addreply` at runtime) |
| Owner only | `.mode public\|self`, `.broadcast` (opt-in subscribers only), `.addreply`, `.delreply`, `.replies`, `.subscribers` |

### Safety built in

- **Paced send queue** — every outbound message goes through one queue with a
  random 4–12 s delay between sends, a daily cap (default 150/day), and quiet
  hours (default 22:00–07:00) during which sends pause and resume later.
- **Opt-in only announcements** — `.broadcast` reaches only people who sent
  `.subscribe`. There is no way to message strangers or people who never
  contacted the bot.
- **No risky features** — no unsolicited messaging, no handling of ephemeral
  media, no automatic reading of other people's updates. Moderation only acts
  inside groups the bot is in.

### Operate it from its own DM (Levanter-style)

Like the bots on the market, this bot is run from its own number: open a
chat with the bot's own number (its own DM) and type commands there — `.menu`,
`.ai`, `.sticker`, `.broadcast`, all of them. A message from the bot's own
account counts as the owner.

- **1:1 chats only** — self-commands work in the bot's own DM and in DMs
  with other people. They never run in groups: the bot ignores its own
  group messages entirely.
- **Loop guard** — every text the bot sends is remembered per chat, so the
  bot's own reply can never trigger itself. Plain text from the bot's own
  number gets no auto-reply; only dot-commands (and plain `ping`) are
  answered.
- **Owner commands from your own phone** — set `OWNER_NUMBER` to the
  number you message from and you can also run owner commands from that
  number. No session ID is needed: pair once with the QR code or the
  8-digit pairing code, and the bot runs from its own DM.
- Test it with `node test-self.js` (9 checks, no WhatsApp connection needed).

## Project layout

```
01-whatsapp-bot/
├── index.js            # entry: connection, QR + pairing code, routing
├── config.js           # all settings from env vars
├── package.json
├── .env.example
├── README.md
├── lib/
│   ├── commands.js     # command registry, .menu, all handlers
│   ├── queue.js        # the paced send queue (delay, cap, quiet hours)
│   ├── store.js        # JSON persistence: groups, warns, subscribers, replies
│   ├── safety.js       # owner/admin checks, anti-spam tracker, link detection
│   ├── stickers.js     # .sticker / .toimg via ffmpeg
│   ├── downloaders.js  # .dl / .dlmp3 via yt-dlp (auto-downloads binary)
│   ├── ai.js           # .ai provider chain (Groq → Gemini → free fallback)
│   ├── utils.js        # .qr / .wiki / .calc / .translate
│   ├── groups.js       # group tools
│   └── moderation.js   # anti-link, anti-spam, warn/ban
├── session/            # login session (created on first run — never commit/share)
├── data/               # store.json (groups, warns, subscribers)
├── tmp/                # temporary downloads (auto-cleaned)
└── bin/                # yt-dlp binary, downloaded on first use
```

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

- `OWNER_NUMBER` — your number, digits only, e.g. `233XXXXXXXXX`.
- `GROQ_API_KEY` / `GEMINI_API_KEY` — optional, for `.ai`. Without either,
  `.ai` uses a free fallback (slower, rate-limited).
- `ffmpeg` must be installed on the system for `.sticker` / `.toimg`
  (`apt install ffmpeg` on Ubuntu/Debian).
- `yt-dlp` is optional: if it is not installed, the bot downloads the
  official standalone binary into `bin/` on first `.dl` use.

## Run

```bash
node index.js
```

On first start the bot prints a QR code — scan it with the bot number's
phone (WhatsApp → Linked Devices). Or set `PAIRING_CODE=true` and
`PAIRING_NUMBER=233XXXXXXXXX` in `.env` to pair with an 8-digit code
instead (enter it in WhatsApp → Linked Devices → Link with phone number).

With pm2 (keeps it running 24/7):

```bash
pm2 start index.js --name whatsapp-bot
pm2 logs whatsapp-bot
pm2 restart whatsapp-bot
```

## Commands in detail

- `.sticker` — send an image (or a video under 10 s) with `.sticker` as the
  caption, or reply to one with `.sticker`. `.toimg` — reply to a sticker.
- `.dl <url>` — downloads a video link (YouTube etc.) up to ~50 MB and sends
  it as a video. `.dlmp3 <url>` sends mp3 audio instead.
- `.ai <prompt>` — tries Groq, then Gemini, then a free fallback.
- `.calc (12 + 8) * 3 / 2` — safe expression parser; functions:
  `sqrt sin cos tan log ln abs pow`.
- `.translate fr Hello, how are you?` — free translation (MyMemory API).
- `.mode self` — only the owner can use commands. `.mode public` — anyone can.
- `.broadcast <message>` — owner only, goes to `.subscribe` opt-in list only.
- `.addreply delivery | Yes, we deliver in Accra.` — adds a keyword auto-reply.
  `.replies` lists them, `.delreply delivery` removes one.
- Group admins: `.warn @user [reason]` — 3 warns (or `WARN_LIMIT`) then the
  member is removed. `.antilink on` deletes links from non-admins.

## Deploy notes

- **Pterodactyl:** create a server from a Node.js egg, upload these files
  into the server root, set the environment variables in the Startup tab,
  start the server, and scan the QR code (or use the pairing code) from the
  console. Keep `session/` and `data/` on the server so the bot stays paired
  and keeps its settings across restarts.
- **Coolify:** deploy as a Node.js app, set the env vars in the app's
  Environment Variables tab, and keep the `session/` and `data/` folders on
  a persistent volume so the login and stored data survive redeploys.
- **ffmpeg:** the Pterodactyl Node.js egg may not include ffmpeg — if
  `.sticker` fails, use an egg/image that has ffmpeg, or install it in the
  server's startup command.

## License

MIT — see the repo LICENSE.
