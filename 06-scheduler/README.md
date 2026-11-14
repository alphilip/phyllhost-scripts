# Scheduler

Runs jobs from `jobs.json` on a cron schedule — reminders, recurring
messages, routine checks, and pings to other services. Every run is
logged and recorded in a run-history file, failed jobs retry
automatically, and an optional status endpoint shows what is scheduled
and what ran last.

## Features

- **Three job types** — `log`, `webhook`, `shell` (see below).
- **Cron validation on startup** — every expression is checked with
  node-cron's `validate()`. One bad expression refuses to start the
  whole scheduler with an error naming the bad job, instead of silently
  skipping it.
- **Retries on failure** — a failed job retries up to N times
  (configurable per job, default 3) with a delay between attempts.
- **Run history** — every run is appended to `data/history.json`
  (timestamp, job, type, status, attempts, duration, output/error),
  capped at 500 entries by default so the file never grows without bound.
- **Timezone support** — the `TZ` env var is applied to all schedules
  (node-cron `timezone` option). Default `Africa/Accra`.
- **Graceful shutdown** — SIGINT / SIGTERM stops all scheduled tasks
  and closes the status server cleanly before exiting.
- **Optional status endpoint** — set `STATUS_PORT` to enable
  `GET /health` and `GET /jobs` (next run time + last run status).
- **Overlap guard** — if a job is still running when its schedule fires
  again, the new run is skipped with a warning instead of piling up.

## Job types

| Type | What it does | Required fields |
| --- | --- | --- |
| `log` | Logs `message` to the console | `message` |
| `webhook` | POSTs JSON `{ job, message, timestamp, attempt, ...payload }` to `url` (any non-2xx response or network error counts as a failure) | `url` (or `WEBHOOK_URL` in `.env` as the default) |
| `shell` | Runs `command` via `child_process.exec` with a timeout and captures stdout/stderr; non-zero exit or timeout counts as a failure | `command` |

> ⚠️ **Shell jobs run commands on your server — only schedule commands
> you wrote and trust.** Never put a shell job's `command` together with
> untrusted input (a webhook body, a scraped page, a message from a
> customer). A shell job can do anything your server's user can do:
> read files, delete files, install things. Treat `jobs.json` like code,
> not like data, and keep it out of any place other people can edit.

## Jobs

Each job in `jobs.json` has:

| Field | Meaning |
| --- | --- |
| `name` | Label shown in the logs and history (required, unique) |
| `schedule` | Cron expression (required) |
| `type` | `log` (default), `webhook`, or `shell` |
| `message` | Text logged (log jobs) or sent (webhook jobs) |
| `url` | Webhook jobs: POST target (falls back to `WEBHOOK_URL`) |
| `payload` | Webhook jobs: extra JSON fields merged into the POST body |
| `command` | Shell jobs: the command to run |
| `retries` | Retries after a failure (default 3, `0` = no retries) |
| `retryDelayMs` | Delay between attempts in ms (default 5000) |
| `shellTimeoutMs` | Shell jobs: kill the command after this long (default 30000) |
| `enabled` | `false` = loaded but never scheduled (default `true`) |

Cron format: `minute hour day-of-month month day-of-week`
(5 fields; a 6-field form with a leading seconds field also works).
Check your expression at https://crontab.guru before saving it.

The three example jobs:

- `morning-reminder` (`log`) — every day at 08:00.
- `weekly-health-ping` (`webhook`) — every Monday at 09:00, POSTs to the
  example URL — **replace `url` with your own endpoint** (or set
  `WEBHOOK_URL` in `.env` and drop the `url` field).
- `disk-space-check` (`shell`) — every day at 07:00, runs `df -h /`.

## How to add a job

1. Open `jobs.json` and add an object to the array, e.g.:

```json
{
  "name": "evening-summary",
  "type": "webhook",
  "schedule": "0 18 * * *",
  "message": "Send the evening sales summary",
  "url": "https://your-service.example.com/alert",
  "retries": 2
}
```

2. Restart the script — jobs are only read at startup.
3. If the scheduler refuses to start, read the error: it names the job
   and the problem (bad cron expression, unknown type, missing field).

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` for your timezone, default webhook URL, and status port.
Edit `jobs.json` to add, change, or remove jobs, then restart — jobs
are only read at startup.

## Run

```bash
node index.js
```

With pm2 (keeps it running 24/7, restarts it if it crashes):

```bash
pm2 start index.js --name scheduler
pm2 logs scheduler
pm2 restart scheduler
pm2 stop scheduler
```

Or from the repo root with the shared config:

```bash
pm2 start ecosystem.config.js --only scheduler
```

## Status endpoint

Set `STATUS_PORT` in `.env` (e.g. `STATUS_PORT=3000`) and restart:

- `GET /health` — `{ status: "ok", uptimeSeconds, timezone, jobs, time }`
- `GET /jobs` — every job with `schedule`, `nextRun` (ISO timestamp),
  `enabled`, `retries`, and `lastRun` (`timestamp`, `status`,
  `attempts`, `durationMs`, `error`).

```bash
curl http://localhost:3000/health
curl http://localhost:3000/jobs
```

Leave `STATUS_PORT` unset to disable the server entirely. The endpoint
is read-only — it never triggers, edits, or deletes jobs — but it does
expose job names, schedules, and command output, so don't publish the
port publicly; keep it on localhost or behind your panel's firewall.

## Run history

Every completed run appends one entry to `data/history.json`:

```json
{
  "timestamp": "2026-11-13T07:00:00.123Z",
  "job": "disk-space-check",
  "type": "shell",
  "status": "success",
  "attempts": 1,
  "durationMs": 42,
  "output": "Filesystem Size Used Avail Use% Mounted on\n...",
  "error": ""
}
```

The file is capped at `HISTORY_MAX_ENTRIES` (default 500); older entries
are dropped. `data/` is gitignored — the log lives on the server only.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `TZ` | `Africa/Accra` | Timezone for all schedules (`TIMEZONE` is a legacy alias; `TZ` wins) |
| `WEBHOOK_URL` | — | Default URL for webhook jobs without their own `url` |
| `STATUS_PORT` | — (disabled) | Port for the `/health` + `/jobs` status server |
| `DEFAULT_RETRIES` | `3` | Default retries per job |
| `RETRY_DELAY_MS` | `5000` | Default delay between attempts (ms) |
| `SHELL_TIMEOUT_MS` | `30000` | Default shell-command timeout (ms) |
| `HISTORY_MAX_ENTRIES` | `500` | Max entries kept in `data/history.json` |

## Deploy notes

- **Pterodactyl:** create a server from a Node.js egg, upload this
  folder's files into the server root, run `npm install`, set the env
  vars in the Startup tab (`TZ`, `WEBHOOK_URL`, `STATUS_PORT` if you
  want the status endpoint), and start the server. The scheduler keeps
  running as long as the server is started. `data/history.json` lives
  in the server's files — it survives restarts but not a server reinstall.
- **Coolify:** deploy as a Node.js app from this repo, set the env vars
  in the app's Environment Variables tab, and deploy. Keep the `data/`
  folder on a persistent volume so the run history survives redeploys.
  If you enable `STATUS_PORT`, expose that port in Coolify only if you
  actually need the endpoint reachable — otherwise leave it internal.

## Project layout

```
06-scheduler/
├── index.js            Entry point: loads jobs, schedules them, handles shutdown
├── jobs.json           Your jobs (3 examples: log, webhook, shell)
├── package.json        Deps: node-cron, axios, express, dotenv
├── .env.example        Env placeholders (copy to .env)
├── lib/
│   ├── config.js       Env config + timezone validation
│   ├── jobs.js         Loads + validates jobs.json (refuses bad jobs)
│   ├── runner.js       Runs jobs by type, with retries + overlap guard
│   ├── history.js      Appends/caps/reads data/history.json
│   ├── next-run.js     Next-run calculator for the /jobs endpoint
│   ├── server.js       Optional Express status server (/health, /jobs)
│   └── logger.js       Timestamped console logging
└── data/
    └── history.json    Run history (created at runtime, gitignored)
```
