// lib/queue.js — the ONE paced send queue.
// Every outbound message in the bot goes through this queue, so the bot can
// never fire messages in a burst. Between sends it waits a random delay
// (default 4-12 seconds), it stops when the daily cap is reached, and it
// pauses during quiet hours (default 22:00-07:00) and resumes afterwards.
// The owner bypasses the daily cap and quiet hours (owner messages are
// replies the owner asked the bot to send, not outreach).
const config = require('../config');
const store = require('./store');
const safety = require('./safety');

const queue = [];
let processing = false;
let quietTimer = null;

function randomDelay() {
  const { minDelayMs, maxDelayMs } = config.queue;
  return minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
}

function inQuietHours(now = new Date()) {
  if (!config.queue.quietHours) return false;
  const hour = now.getHours();
  const { quietStartHour, quietEndHour } = config.queue;
  // Quiet window may wrap midnight (e.g. 22:00 -> 07:00).
  if (quietStartHour < quietEndHour) return hour >= quietStartHour && hour < quietEndHour;
  return hour >= quietStartHour || hour < quietEndHour;
}

function msUntilQuietEnds(now = new Date()) {
  const end = new Date(now);
  end.setHours(config.queue.quietEndHour, 0, 0, 0);
  if (end <= now) end.setDate(end.getDate() + 1);
  return end - now;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Enqueue one outbound send.
 * @param {object} sock Baileys socket
 * @param {string} jid destination JID
 * @param {object} content sendMessage content, e.g. { text: 'hi' }
 * @param {object} [opts] { owner: true } bypasses cap + quiet hours
 * @returns {Promise<object|null>} the sendMessage result, or null if dropped by the cap
 */
function enqueue(sock, jid, content, opts = {}) {
  // Loop guard: remember what we are about to send, so the bot's own echo
  // of it (a fromMe message) is not mistaken for a new command. Recorded
  // here at enqueue time, before the send, so the echo is already known
  // by the time it arrives.
  if (content && typeof content.text === 'string') {
    safety.recordSent(jid, content.text);
  }
  return new Promise((resolve, reject) => {
    queue.push({ sock, jid, content, owner: !!opts.owner, resolve, reject, enqueuedAt: Date.now() });
    processQueue().catch(reject);
  });
}

async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    while (queue.length > 0) {
      const job = queue[0];

      // Daily cap (owner messages don't count).
      if (!job.owner && store.dailySent() >= config.queue.dailyCap) {
        console.log(`[queue] daily cap (${config.queue.dailyCap}) reached — dropping queued send to ${job.jid}`);
        queue.shift();
        job.resolve(null);
        continue;
      }

      // Quiet hours: pause the whole queue until they end.
      if (!job.owner && inQuietHours()) {
        const wait = msUntilQuietEnds();
        console.log(`[queue] quiet hours — pausing sends for ${Math.round(wait / 60000)} min`);
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => processQueue(), wait);
        break;
      }

      queue.shift();
      try {
        const result = await job.sock.sendMessage(job.jid, job.content);
        if (!job.owner) store.bumpDailySent();
        job.resolve(result);
      } catch (err) {
        console.error('[queue] send failed:', err.message);
        job.reject(err);
      }

      // Random delay before the next send — never a burst.
      if (queue.length > 0) await sleep(randomDelay());
    }
  } finally {
    processing = false;
  }
}

function pendingCount() {
  return queue.length;
}

module.exports = { enqueue, pendingCount, inQuietHours, randomDelay };
