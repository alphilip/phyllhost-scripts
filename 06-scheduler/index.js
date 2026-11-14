// Job scheduler — runs jobs from jobs.json on a cron schedule.
//
// Job types (see jobs.json + README.md):
//   log     — log a message
//   webhook — POST JSON to a URL
//   shell   — run a shell command and capture its output
//
// Startup is strict: a bad cron expression, an unknown job type, or a
// missing required field refuses to start with an error naming the job
// (see lib/jobs.js). Fix jobs.json and restart — jobs are only read at startup.
//
// Shutdown is graceful: SIGINT / SIGTERM stops every scheduled task and
// closes the status server before exiting, so a restart never leaves a
// half-finished run or a dangling timer behind.
const cron = require('node-cron');
const config = require('./lib/config');
const { loadJobs } = require('./lib/jobs');
const { runJob } = require('./lib/runner');
const { startStatusServer } = require('./lib/server');
const { info, warn, error } = require('./lib/logger');

const scheduledTasks = [];
let statusServer = null;
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  info(`Received ${signal} — shutting down gracefully…`);

  for (const { task, job } of scheduledTasks) {
    task.stop();
    info(`Stopped "${job.name}"`);
  }

  if (statusServer) {
    statusServer.close(() => {
      info('Status server closed.');
      process.exit(0);
    });
    // Don't hang forever on a stuck connection — force out after 5s.
    setTimeout(() => {
      warn('Status server did not close in time — exiting anyway.');
      process.exit(0);
    }, 5000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function main() {
  let jobs;
  try {
    jobs = loadJobs(config.jobsFile, config);
  } catch (err) {
    error(err.message);
    error('Scheduler refused to start. Fix jobs.json and try again.');
    process.exit(1);
  }

  if (jobs.length === 0) {
    info('jobs.json has no jobs — add one and restart.');
    process.exit(0);
  }

  for (const job of jobs) {
    if (!job.enabled) {
      info(`"${job.name}" is disabled (enabled: false) — not scheduled.`);
      continue;
    }
    const task = cron.schedule(job.schedule, () => runJob(job, config), {
      timezone: config.timezone,
    });
    scheduledTasks.push({ task, job });
    info(`Scheduled "${job.name}" [${job.type}] — ${job.schedule} (${config.timezone})`);
  }

  statusServer = startStatusServer(config, jobs);

  info(
    `Scheduler running: ${scheduledTasks.length} job(s) scheduled, ` +
    `${jobs.length - scheduledTasks.length} disabled. Timezone ${config.timezone}. ` +
    `History: ${config.historyFile} (max ${config.historyMaxEntries} entries).`
  );
}

main();
