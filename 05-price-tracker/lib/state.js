// Alert state — data/state.json.
// Persists per-target state across restarts so an alert fires exactly
// once per state change and does not re-fire after a restart:
//   { "<target name>": { lastPrice, inStock, alertedPriceDrop, alertedBackInStock } }
//
// Re-arm rules:
// - price-drop alert re-arms when the price rises back above targetPrice.
// - back-in-stock alert re-arms when the item goes out of stock again.
'use strict';

const fs = require('fs');
const path = require('path');

function statePath(dataDir) {
  return path.join(dataDir, 'state.json');
}

function loadState(dataDir) {
  const file = statePath(dataDir);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[state] could not read ${file}: ${err.message} — starting fresh`);
    }
    return {};
  }
}

function saveState(dataDir, state) {
  const file = statePath(dataDir);
  const tmp = `${file}.tmp`;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

function getTargetState(state, targetName) {
  return (
    state[targetName] || {
      lastPrice: null,
      inStock: null,
      alertedPriceDrop: false,
      alertedBackInStock: false,
    }
  );
}

module.exports = { loadState, saveState, getTargetState };
