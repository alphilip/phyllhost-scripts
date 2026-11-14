// Load and validate jobs.json.
//
// Validation is strict on purpose: a bad job refuses to start the whole
// scheduler (exit 1 with a message naming the job), instead of silently
// skipping it and leaving the owner wondering why a job never ran.
//
// Job shape (see jobs.json for examples):
//   name           string, required, unique — label used in logs + history
//   schedule       cron expression, required — validated with node-cron
//   type           "log" | "webhook" | "shell" (default "log")
//   message        string — logged (log jobs) or sent (webhook jobs)
//   url            webhook jobs: POST target (falls back to WEBHOOK_URL)
//   payload        webhook jobs: extra JSON fields merged into the POST body
//   command        shell jobs: the command to run (see the security warning
//                  in README.md — only schedule commands you trust)
//   retries        how many times to retry a failed run (default 3)
//   retryDelayMs   delay between attempts in ms (default 5000)
//   shellTimeoutMs shell jobs: kill the command after this long (default 30000)
//   enabled        false = loaded but never scheduled (default true)
const fs = require('fs');
const cron = require('node-cron');
const { error } = require('./logger');

const JOB_TYPES = ['log', 'webhook', 'shell'];

function fail(jobName, message) {
  throw new Error(`jobs.json — job "${jobName}": ${message}`);
}

function loadJobs(jobsFile, config) {
  let raw;
  try {
    raw = fs.readFileSync(jobsFile, 'utf8');
  } catch (err) {
    error(`Could not read jobs.json: ${err.message}`);
    process.exit(1);
  }

  let jobs;
  try {
    jobs = JSON.parse(raw);
  } catch (err) {
    error(`jobs.json is not valid JSON: ${err.message}`);
    process.exit(1);
  }
  if (!Array.isArray(jobs)) {
    error('jobs.json must contain a JSON array of jobs.');
    process.exit(1);
  }

  const seenNames = new Set();
  const normalized = jobs.map((job, index) => {
    const label = (job && job.name) || `#${index + 1} (no name)`;

    if (!job || typeof job !== 'object') fail(label, 'each job must be an object');
    if (!job.name || typeof job.name !== 'string') {
      fail(label, 'missing "name" (a non-empty string is required)');
    }
    if (seenNames.has(job.name)) fail(job.name, `duplicate job name — names must be unique`);
    seenNames.add(job.name);

    if (!job.schedule || typeof job.schedule !== 'string') {
      fail(job.name, 'missing "schedule" (a cron expression string is required)');
    }
    if (!cron.validate(job.schedule)) {
      fail(job.name, `invalid cron expression "${job.schedule}" — check it at https://crontab.guru`);
    }

    const type = job.type || 'log';
    if (!JOB_TYPES.includes(type)) {
      fail(job.name, `unknown type "${type}" — must be one of: ${JOB_TYPES.join(', ')}`);
    }

    if (type === 'webhook') {
      const url = job.url || config.defaultWebhookUrl;
      if (!url) {
        fail(job.name, 'webhook job needs "url", or set WEBHOOK_URL in .env as the default');
      }
    }
    if (type === 'shell' && (!job.command || typeof job.command !== 'string')) {
      fail(job.name, 'shell job needs "command" (a non-empty string)');
    }

    const retries = job.retries === undefined ? config.defaultRetries : job.retries;
    if (!Number.isInteger(retries) || retries < 0) {
      fail(job.name, `"retries" must be a whole number >= 0, got ${JSON.stringify(job.retries)}`);
    }
    const retryDelayMs = job.retryDelayMs === undefined ? config.retryDelayMs : job.retryDelayMs;
    if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0) {
      fail(job.name, `"retryDelayMs" must be a whole number >= 0, got ${JSON.stringify(job.retryDelayMs)}`);
    }
    const shellTimeoutMs = job.shellTimeoutMs === undefined ? config.shellTimeoutMs : job.shellTimeoutMs;
    if (!Number.isInteger(shellTimeoutMs) || shellTimeoutMs < 1000) {
      fail(job.name, `"shellTimeoutMs" must be a whole number >= 1000, got ${JSON.stringify(job.shellTimeoutMs)}`);
    }

    return {
      name: job.name,
      schedule: job.schedule,
      type,
      message: typeof job.message === 'string' ? job.message : '',
      url: job.url || config.defaultWebhookUrl || '',
      payload: job.payload && typeof job.payload === 'object' ? job.payload : {},
      command: typeof job.command === 'string' ? job.command : '',
      retries,
      retryDelayMs,
      shellTimeoutMs,
      enabled: job.enabled !== false,
    };
  });

  return normalized;
}

module.exports = { loadJobs, JOB_TYPES };
