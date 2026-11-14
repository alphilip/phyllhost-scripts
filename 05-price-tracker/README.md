# Price Tracker

Watches product pages on a schedule, keeps a price history, and alerts
you when a price drops to your target or an out-of-stock item comes back.

## Features

- **Multiple targets** — every target lives in `targets.json` with its
  own URL, price selector, target price, check interval, and optional
  stock selector. Each target runs on its own schedule.
- **Price history** — every check is appended to `data/history.json`
  (`timestamp`, `target`, `price`, `inStock`), capped at the last 500
  entries per target (configurable with `MAX_HISTORY_ENTRIES`).
- **Price-drop alerts** — fires when the price falls to `targetPrice`
  or below. Fires **once** per drop; it re-arms automatically when the
  price rises back above the target.
- **Back-in-stock alerts** — fires when an item that was out of stock
  comes back in. Also fires once per event and re-arms when the item
  goes out of stock again.
- **Alert state survives restarts** — `data/state.json` remembers the
  last price, stock status, and which alerts already fired, so a
  restart never re-sends an old alert.
- **Webhook alerts** — if `WEBHOOK_URL` is set, every alert is POSTed
  as JSON: `{ "target", "price", "url", "type" }`, where `type` is
  `"price-drop"` or `"back-in-stock"`. Works with the Telegram notify
  bot in this repo (`03-telegram-notify-bot`) or any endpoint that
  accepts JSON. A failed webhook is logged, never fatal.
- **Polite crawling** — a real identifying `User-Agent` on every
  request, a per-target interval, plus a global minimum delay between
  *any* two fetches (`MIN_DELAY_SECONDS`, default 10s) so targets
  never pile onto a site at the same moment.
- **Robust price parsing** — handles currency symbols (`GH₵`, `$`, `€`,
  `£`, …), thousands separators and decimals in US (`1,299.99`) and
  European (`1.299,99`) styles, and price ranges (takes the lower
  price). If a price can't be parsed, it logs a clear warning with the
  raw text instead of crashing.
- **Resilient** — a failed fetch, a missing price element, or a bad
  target in `targets.json` is logged and skipped; the other targets
  keep checking.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` (all values optional — the defaults work out of the box):

| Variable | Default | What it does |
| --- | --- | --- |
| `WEBHOOK_URL` | _(empty)_ | POST alerts here as JSON. Blank = console only. |
| `USER_AGENT` | `PhyllHost-Price-Tracker/2.0 …` | Sent with every request. |
| `MIN_DELAY_SECONDS` | `10` | Minimum seconds between any two fetches. |
| `MAX_HISTORY_ENTRIES` | `500` | History entries kept per target. |
| `REQUEST_TIMEOUT_MS` | `20000` | HTTP timeout per check. |
| `DATA_DIR` | `./data` | Where `history.json` / `state.json` live. |
| `CHECK_ON_START` | `true` | Check immediately at startup (`false` = wait for the first interval). |

## Adding targets

Edit `targets.json` — one object per product:

```json
[
  {
    "name": "Wireless Headphones",
    "url": "https://example.com/products/wireless-headphones",
    "cssSelector": ".price",
    "targetPrice": 49.99,
    "checkIntervalMinutes": 60,
    "inStockSelector": ".stock-status"
  }
]
```

| Field | Required | What it does |
| --- | --- | --- |
| `name` | yes | Label used in logs, history, and alerts. Must be unique. |
| `url` | yes | Product page to watch (http/https). |
| `cssSelector` | yes | CSS selector of the price element. Open the page in a browser, right-click the price, choose Inspect, copy its selector (e.g. `.price`, `#product-price`). |
| `targetPrice` | no (default `0` = never alert) | Alert when the price is at or below this. |
| `checkIntervalMinutes` | no (default `60`) | How often to check this target. |
| `inStockSelector` | no | Selector for the stock indicator (e.g. `.stock-status`, `.add-to-cart`). If set: the item counts as in stock when the element exists and its text does **not** say "Out of stock" / "Sold out" / "Notify me". If the element is missing entirely, the item counts as out of stock. Omit it to skip stock tracking for that target. |

Restart the tracker after editing `targets.json`. Invalid entries are
logged and skipped — the valid ones keep running.

## Run

```bash
node index.js
```

Keep it running 24/7 with pm2:

```bash
pm2 start index.js --name price-tracker
pm2 save
pm2 logs price-tracker
```

Or start every script in this repo at once from the repo root:

```bash
pm2 start ecosystem.config.js --only price-tracker
```

Check what it is doing:

```bash
# Live log of checks and alerts
pm2 logs price-tracker

# Full price history (JSON array, newest last)
cat data/history.json

# Current state: last price / stock / which alerts already fired
cat data/state.json
```

## Deploy notes

- **Pterodactyl:** upload these files into a Node.js server's root,
  run `npm install`, set the env vars in the Startup tab (or upload a
  `.env` file), and start the server. `data/` is created automatically
  on first run.
- **Coolify:** deploy as a Node.js app (`npm install` build command,
  `node index.js` start command) and set the env vars in the app.
  Attach a persistent volume to the app's `data/` folder if you want
  history and alert state to survive redeploys.

## Be polite — read this before adding a target

Only track pages you are allowed to check. Respect the site's
`robots.txt` and terms of service, keep the check interval generous
(60 minutes or more per product is a good default), and never point
this at a login-protected page or use it to scrape a whole site.
Checking too often can get your IP blocked — that is the site telling
you to slow down, so do.
