// Configuration — loads targets.json and env vars, validates everything,
// and returns one config object. Invalid targets are skipped with a clear
// error instead of crashing the whole tracker.
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_USER_AGENT =
  'PhyllHost-Price-Tracker/2.0 (price alerts; +https://example.com)';

function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function validateTarget(raw, index) {
  const problems = [];
  if (!raw || typeof raw !== 'object') return { ok: false, problems: ['not an object'] };
  if (!raw.name || typeof raw.name !== 'string') problems.push('missing "name"');
  if (!raw.url || typeof raw.url !== 'string') {
    problems.push('missing "url"');
  } else {
    try {
      const parsed = new URL(raw.url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        problems.push(`"url" must be http(s), got "${parsed.protocol}"`);
      }
    } catch {
      problems.push(`"url" is not a valid URL: "${raw.url}"`);
    }
  }
  if (!raw.cssSelector || typeof raw.cssSelector !== 'string') {
    problems.push('missing "cssSelector"');
  }
  if (raw.targetPrice !== undefined && !Number.isFinite(Number(raw.targetPrice))) {
    problems.push(`"targetPrice" is not a number: ${raw.targetPrice}`);
  }
  if (
    raw.checkIntervalMinutes !== undefined &&
    (!Number.isFinite(Number(raw.checkIntervalMinutes)) ||
      Number(raw.checkIntervalMinutes) <= 0)
  ) {
    problems.push(`"checkIntervalMinutes" must be a positive number, got ${raw.checkIntervalMinutes}`);
  }
  if (
    raw.inStockSelector !== undefined &&
    typeof raw.inStockSelector !== 'string'
  ) {
    problems.push('"inStockSelector" must be a string');
  }
  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    target: {
      name: raw.name.trim(),
      url: raw.url.trim(),
      cssSelector: raw.cssSelector.trim(),
      targetPrice:
        raw.targetPrice === undefined ? 0 : Number(raw.targetPrice),
      checkIntervalMinutes:
        raw.checkIntervalMinutes === undefined
          ? 60
          : Number(raw.checkIntervalMinutes),
      inStockSelector: raw.inStockSelector
        ? raw.inStockSelector.trim()
        : null,
    },
  };
}

function loadConfig() {
  const targetsFile = path.join(__dirname, '..', 'targets.json');
  let rawTargets;
  try {
    rawTargets = JSON.parse(fs.readFileSync(targetsFile, 'utf8'));
  } catch (err) {
    throw new Error(`could not read targets.json (${targetsFile}): ${err.message}`);
  }
  if (!Array.isArray(rawTargets)) {
    throw new Error('targets.json must contain a JSON array of targets');
  }

  const targets = [];
  rawTargets.forEach((raw, index) => {
    const result = validateTarget(raw, index);
    if (!result.ok) {
      console.error(
        `[config] skipping targets.json[${index}]: ${result.problems.join('; ')}`
      );
      return;
    }
    if (targets.some((t) => t.name === result.target.name)) {
      console.error(
        `[config] skipping targets.json[${index}]: duplicate target name "${result.target.name}"`
      );
      return;
    }
    targets.push(result.target);
  });

  if (targets.length === 0) {
    throw new Error('no valid targets in targets.json — add at least one and restart');
  }

  return {
    targets,
    webhookUrl: (process.env.WEBHOOK_URL || '').trim(),
    userAgent: (process.env.USER_AGENT || '').trim() || DEFAULT_USER_AGENT,
    minDelayMs: envInt('MIN_DELAY_SECONDS', 10) * 1000,
    maxHistoryEntries: envInt('MAX_HISTORY_ENTRIES', 500),
    timeoutMs: envInt('REQUEST_TIMEOUT_MS', 20000),
    dataDir: path.resolve(
      process.env.DATA_DIR || path.join(__dirname, '..', 'data')
    ),
    checkOnStart: (process.env.CHECK_ON_START || 'true').toLowerCase() !== 'false',
  };
}

module.exports = { loadConfig };
