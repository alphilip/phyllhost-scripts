// Executes jobs, with retries and run-history recording.
//
// One execution per job type:
//   log     — logs the message (always succeeds unless the message is empty
//             and there is nothing to do — still counts as a success).
//   webhook — axios POST of { job, message, timestamp, attempt, ...payload }.
//             Any non-2xx status or network error is a failure.
//   shell   — child_process.exec with a hard timeout (job.shellTimeoutMs).
//             Non-zero exit, timeout, or spawn error is a failure.
//             stdout/stderr are captured and stored in the history entry
//             (truncated, so a chatty command cannot bloat history.json).
//
// Retries: on failure the job is retried up to `retries` times, waiting
// `retryDelayMs` between attempts. The history entry records the final
// outcome plus how many attempts it took.
//
// Overlap guard: if a job is still running when its schedule fires again,
// the new run is skipped with a warning instead of piling up — a slow
// shell command or a hanging webhook must never stack up concurrent runs.
const axios = require('axios');
const { exec } = require('child_process');
const history = require('./history');
const { info, warn, error } = require('./logger');

const MAX_OUTPUT_CHARS = 4000;
const running = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(text) {
  const str = String(text || '');
  return str.length > MAX_OUTPUT_CHARS ? str.slice(0, MAX_OUTPUT_CHARS) + '\n…[truncated]' : str;
}

function runShell(command, timeoutMs) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const output = truncate(`${stdout || ''}${stderr ? `\n[stderr]\n${stderr}` : ''}`.trim());
      if (err) {
        const reason = err.killed ? `timed out after ${timeoutMs}ms` : `exited with code ${err.code}`;
        reject(new Error(`shell command ${reason}${output ? `: ${output}` : ''}`));
      } else {
        resolve(output);
      }
    });
  });
}

async function executeOnce(job, attempt) {
  if (job.type === 'log') {
    const message = job.message || '(no message)';
    info(`[${job.name}] ${message}`);
    return message;
  }

  if (job.type === 'webhook') {
    const body = {
      job: job.name,
      message: job.message || '',
      timestamp: new Date().toISOString(),
      attempt,
      ...job.payload,
    };
    const res = await axios.post(job.url, body, { timeout: 15000 });
    const output = `POST ${job.url} → HTTP ${res.status}`;
    info(`[${job.name}] webhook delivered (${output})`);
    return output;
  }

  // shell
  const output = await runShell(job.command, job.shellTimeoutMs);
  info(`[${job.name}] shell OK: ${job.command}${output ? ` → ${output.split('\n')[0]}` : ''}`);
  return output;
}

async function runJob(job, config) {
  if (running.has(job.name)) {
    warn(`[${job.name}] previous run still in progress — skipping this scheduled run`);
    return null;
  }
  running.add(job.name);
  const startedAt = Date.now();
  let attempts = 0;
  let lastError = null;
  let output = '';

  try {
    // `attempt` is the loop counter; `attempts` is the count actually
    // executed (kept separate because the loop counter increments once
    // more when the loop exits after the final failed attempt).
    for (let attempt = 1; attempt <= job.retries + 1; attempt++) {
      attempts = attempt;
      try {
        output = await executeOnce(job, attempt);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        error(`[${job.name}] attempt ${attempt}/${job.retries + 1} failed: ${err.message}`);
        if (attempt <= job.retries) {
          info(`[${job.name}] retrying in ${job.retryDelayMs}ms…`);
          await sleep(job.retryDelayMs);
        }
      }
    }
  } finally {
    running.delete(job.name);
  }

  const entry = {
    timestamp: new Date(startedAt).toISOString(),
    job: job.name,
    type: job.type,
    status: lastError ? 'failed' : 'success',
    attempts,
    durationMs: Date.now() - startedAt,
    output: truncate(output),
    error: lastError ? truncate(lastError.message) : '',
  };
  history.appendRun(config.historyFile, config.historyMaxEntries, entry);

  if (lastError) {
    error(`[${job.name}] FAILED after ${attempts} attempt(s)`);
  } else {
    info(`[${job.name}] done in ${entry.durationMs}ms (attempt ${attempts})`);
  }
  return entry;
}

module.exports = { runJob };
