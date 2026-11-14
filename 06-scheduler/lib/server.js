// Optional status HTTP server (Express), enabled only when STATUS_PORT is set.
//   GET /health — liveness: { status, uptimeSeconds, timezone, jobs, time }
//   GET /jobs   — every job with its schedule, next run time and last run
//                 status (from data/history.json).
// This is a read-only status view: it never triggers, edits, or deletes jobs.
const express = require('express');
const history = require('./history');
const { getNextRun } = require('./next-run');
const { info, error } = require('./logger');

function startStatusServer(config, jobs) {
  if (!config.statusPort) return null;

  const app = express();
  const startedAt = Date.now();

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timezone: config.timezone,
      jobs: jobs.length,
      time: new Date().toISOString(),
    });
  });

  app.get('/jobs', (req, res) => {
    const lastRuns = history.getLastRunByJob(config.historyFile);
    res.json(
      jobs.map((job) => {
        let nextRun = null;
        try {
          const next = getNextRun(job.schedule, new Date(), config.timezone);
          nextRun = next ? next.toISOString() : null;
        } catch (err) {
          nextRun = null;
        }
        const last = lastRuns[job.name];
        return {
          name: job.name,
          type: job.type,
          schedule: job.schedule,
          timezone: config.timezone,
          enabled: job.enabled,
          retries: job.retries,
          nextRun,
          lastRun: last
            ? {
                timestamp: last.timestamp,
                status: last.status,
                attempts: last.attempts,
                durationMs: last.durationMs,
                error: last.error || undefined,
              }
            : null,
        };
      })
    );
  });

  const server = app.listen(config.statusPort, () => {
    info(`Status server listening on port ${config.statusPort} — /health, /jobs`);
  });
  server.on('error', (err) => {
    error(`Status server failed to start on port ${config.statusPort}: ${err.message}`);
  });
  return server;
}

module.exports = { startStatusServer };
