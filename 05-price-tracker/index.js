// Price Tracker 2.0 — entry point and scheduler.
//
// Watches every target in targets.json on its own schedule, logs each
// check to data/history.json, and alerts (console + optional webhook)
// on price drops and back-in-stock events — once per state change.
//
// Run:  node index.js        or        pm2 start index.js --name price-tracker
'use strict';

require('dotenv').config();

const { loadConfig } = require('./lib/config');
const { checkTarget } = require('./lib/checker');
const { appendEntry } = require('./lib/history');
const { loadState, saveState, getTargetState } = require('./lib/state');
const { sendAlert } = require('./lib/alerter');

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`[fatal] ${err.message}`);
  process.exit(1);
}

const state = loadState(config.dataDir);
const timers = [];

function stamp() {
  return new Date().toISOString();
}

/**
 * Check one target: fetch, log history, evaluate alerts, persist state.
 * A failed fetch or an unparseable price never crashes the tracker —
 * it is logged and retried on the next interval.
 */
async function runCheck(target) {
  const log = (msg) => console.log(`[${stamp()}] [${target.name}] ${msg}`);

  let result;
  try {
    result = await checkTarget(target, {
      userAgent: config.userAgent,
      timeoutMs: config.timeoutMs,
      minDelayMs: config.minDelayMs,
    });
  } catch (err) {
    log(`check failed: ${err.message}`);
    return;
  }

  for (const warning of result.warnings) {
    log(`WARNING: ${warning}`);
  }
  if (result.price === null) {
    // Nothing to log or alert on — the warning above already explains why.
    return;
  }

  const entry = appendEntry(config.dataDir, config.maxHistoryEntries, {
    target: target.name,
    price: result.price,
    inStock: result.inStock,
  });
  log(
    `price: ${result.price}` +
      (result.inStock === null ? '' : result.inStock ? ' | in stock' : ' | OUT OF STOCK') +
      ` (target: ${target.targetPrice || 'none'})`
  );

  const targetState = getTargetState(state, target.name);
  const wasInStock = targetState.inStock;
  const alerts = [];

  // --- Price-drop alert (fires once, re-arms when price rises again) ---
  if (target.targetPrice > 0) {
    if (result.price <= target.targetPrice && !targetState.alertedPriceDrop) {
      targetState.alertedPriceDrop = true;
      alerts.push({ type: 'price-drop', target: target.name, price: result.price, url: target.url });
    } else if (result.price > target.targetPrice && targetState.alertedPriceDrop) {
      targetState.alertedPriceDrop = false;
      log(`price rose back above target ${target.targetPrice} — price-drop alert re-armed`);
    }
  }

  // --- Back-in-stock alert (fires once, re-arms when it goes out again) ---
  if (result.inStock !== null) {
    if (result.inStock && wasInStock === false && !targetState.alertedBackInStock) {
      targetState.alertedBackInStock = true;
      alerts.push({ type: 'back-in-stock', target: target.name, price: result.price, url: target.url });
    } else if (!result.inStock) {
      if (targetState.alertedBackInStock) {
        log('went out of stock — back-in-stock alert re-armed');
      }
      targetState.alertedBackInStock = false;
    }
  }

  targetState.lastPrice = result.price;
  targetState.inStock = result.inStock;
  state[target.name] = targetState;
  saveState(config.dataDir, state);

  for (const alert of alerts) {
    await sendAlert(
      { webhookUrl: config.webhookUrl, timeoutMs: config.timeoutMs },
      alert
    );
  }
}

function scheduleTarget(target, initialDelayMs) {
  const intervalMs = target.checkIntervalMinutes * 60 * 1000;
  console.log(
    `  • ${target.name} — every ${target.checkIntervalMinutes} min` +
      ` | target ${target.targetPrice || 'none'} | ${target.url}`
  );

  const start = () => {
    runCheck(target);
    timers.push(setInterval(() => runCheck(target), intervalMs));
  };

  if (config.checkOnStart) {
    // Stagger first checks so all targets don't hit at the same second.
    timers.push(setTimeout(start, initialDelayMs));
  } else {
    timers.push(setTimeout(start, intervalMs));
  }
}

function shutdown(signal) {
  console.log(`\n[${stamp()}] ${signal} received — shutting down...`);
  for (const timer of timers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  saveState(config.dataDir, state);
  console.log(`[${stamp()}] state saved. Goodbye.`);
  process.exit(0);
}

console.log('Price Tracker 2.0 starting...');
console.log(`Targets: ${config.targets.length} | history: data/history.json (last ${config.maxHistoryEntries} per target)`);
console.log(`Webhook: ${config.webhookUrl ? 'enabled' : 'disabled (console only)'}`);
console.log(`Politeness: min ${config.minDelayMs / 1000}s between fetches | User-Agent: ${config.userAgent}`);
config.targets.forEach((target, i) => scheduleTarget(target, i * 5000));

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
