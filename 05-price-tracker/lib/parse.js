// Price parsing — turns raw text scraped from a page into a number.
// Handles currency symbols (GH₵, $, €, £, ...), thousands separators and
// decimals in both US ("1,299.99") and European ("1.299,99") styles.
// Returns a finite number, or null when no price can be found.
'use strict';

/**
 * Parse a price from raw text.
 * @param {string} text — raw text from the price element, e.g. "GH₵1,299.99"
 * @returns {number|null}
 */
function parsePrice(text) {
  if (text === null || text === undefined) return null;
  const str = String(text).trim();
  if (!str) return null;

  // Take the first number-like run (digits, commas, dots). This also
  // handles ranges such as "GH₵100 – GH₵200" by taking the lower price.
  const match = str.match(/[\d][\d.,]*/);
  if (!match) return null;

  let num = match[0];
  const hasDot = num.includes('.');
  const hasComma = num.includes(',');

  if (hasDot && hasComma) {
    // Both separators present: the LAST one is the decimal separator.
    if (num.lastIndexOf(',') > num.lastIndexOf('.')) {
      // European style: 1.299,99 -> 1299.99
      num = num.replace(/\./g, '').replace(',', '.');
    } else {
      // US style: 1,299.99 -> 1299.99
      num = num.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Only commas. A single comma followed by exactly 3 digits is a
    // thousands separator ("1,299"); anything else is a decimal comma
    // ("12,99" or "1,299,99").
    const parts = num.split(',');
    if (parts.length === 2 && parts[1].length === 3) {
      num = num.replace(',', '');
    } else {
      num = num.replace(/,/g, '.');
    }
  }
  // Only dots (or none): already a plain decimal number.

  const value = parseFloat(num);
  return Number.isFinite(value) ? value : null;
}

module.exports = { parsePrice };
