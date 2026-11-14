// Alerts — console + optional webhook POST.
// Payload shape (always the same, both channels):
//   { target, price, url, type }
// where type is "price-drop" or "back-in-stock".
// A webhook failure is logged, never fatal — the next check still runs.
'use strict';

const axios = require('axios');

/**
 * Send one alert.
 * @param {object} opts — { webhookUrl, timeoutMs }
 * @param {object} alert — { type, target, price, url }
 */
async function sendAlert(opts, alert) {
  const payload = {
    target: alert.target,
    price: alert.price,
    url: alert.url,
    type: alert.type,
  };

  const label =
    alert.type === 'price-drop'
      ? `PRICE DROP: ${alert.target} is now ${alert.price}`
      : `BACK IN STOCK: ${alert.target} is available again at ${alert.price}`;
  console.log(`[alert] ${label} — ${alert.url}`);

  if (!opts.webhookUrl) return;

  try {
    await axios.post(opts.webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: opts.timeoutMs || 10000,
    });
    console.log(`[alert] webhook delivered to ${opts.webhookUrl}`);
  } catch (err) {
    console.error(`[alert] webhook failed (${opts.webhookUrl}): ${err.message}`);
  }
}

module.exports = { sendAlert };
