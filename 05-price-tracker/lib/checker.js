// Page fetching + extraction for one target.
// Polite by design: every request carries the configured User-Agent, and
// a global minimum delay is enforced between ANY two fetches so several
// targets never hammer a site (or several sites) at the same moment.
'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const { parsePrice } = require('./parse');

// Phrases that mean "not available" when they appear in the stock text.
const OUT_OF_STOCK_PHRASES = [
  'out of stock',
  'out-of-stock',
  'sold out',
  'unavailable',
  'notify me',
  'notify when available',
  'currently unavailable',
];

let nextAllowedAt = 0; // timestamp (ms) before which no fetch may start

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until the global politeness window has passed, then reserve the
 * next slot. Serialises all fetches across targets.
 */
async function politeWait(minDelayMs) {
  const now = Date.now();
  const waitMs = Math.max(0, nextAllowedAt - now);
  if (waitMs > 0) await sleep(waitMs);
  nextAllowedAt = Date.now() + minDelayMs;
}

/**
 * Decide in-stock from the element matched by inStockSelector.
 * - No selector configured: stock is unknown (null).
 * - Selector matches nothing: treated as out of stock — on most shops the
 *   stock badge / "Add to cart" button only exists when the item is in.
 * - Selector matches: in stock unless its text contains an out-of-stock
 *   phrase ("Out of stock", "Sold out", "Notify me", ...).
 */
function detectStock($, inStockSelector) {
  if (!inStockSelector) return null;
  const el = $(inStockSelector).first();
  if (!el.length) return false;
  const text = el.text().trim().toLowerCase();
  if (!text) return false;
  return !OUT_OF_STOCK_PHRASES.some((phrase) => text.includes(phrase));
}

/**
 * Fetch one target's page and extract its price and stock status.
 * Never throws for a missing/unparseable price — that is reported as a
 * warning in the result instead. Network errors DO throw so the caller
 * can log them and retry on the next interval.
 *
 * @param {object} target — { name, url, cssSelector, inStockSelector }
 * @param {object} opts — { userAgent, timeoutMs, minDelayMs }
 * @returns {Promise<{price: number|null, rawPrice: string, inStock: boolean|null, warnings: string[]}>}
 */
async function checkTarget(target, opts) {
  await politeWait(opts.minDelayMs);

  const res = await axios.get(target.url, {
    headers: {
      'User-Agent': opts.userAgent,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: opts.timeoutMs,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const $ = cheerio.load(res.data);
  const warnings = [];

  const rawPrice = $(target.cssSelector).first().text().trim();
  let price = null;
  if (!rawPrice) {
    warnings.push(
      `no element matched price selector "${target.cssSelector}"`
    );
  } else {
    price = parsePrice(rawPrice);
    if (price === null) {
      warnings.push(
        `could not parse a price from "${rawPrice}" ` +
          `(selector "${target.cssSelector}") — check the selector, ` +
          `the site may have changed its layout`
      );
    }
  }

  const inStock = detectStock($, target.inStockSelector);

  return { price, rawPrice, inStock, warnings };
}

module.exports = { checkTarget };
