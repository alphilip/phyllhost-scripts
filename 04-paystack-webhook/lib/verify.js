// HMAC-SHA512 signature verification for Paystack webhooks.
//
// Paystack signs every webhook with your secret key and sends the
// hex digest in the `x-paystack-signature` header:
//   signature = HMAC-SHA512(secret_key, raw_request_body)
//
// The RAW body must be used — re-serialising the parsed JSON would
// produce a different digest. index.js keeps the raw body with
// express.json's `verify` option (see `req.rawBody`).
//
// The comparison is timing-safe (crypto.timingSafeEqual) so an
// attacker cannot learn the correct signature byte-by-byte from
// response times.
const crypto = require('crypto');

function computeSignature(secret, rawBody) {
  return crypto.createHmac('sha512', secret).update(rawBody).digest();
}

/**
 * @param {string} secret - PAYSTACK_SECRET_KEY
 * @param {Buffer|string} rawBody - the raw request body, exactly as received
 * @param {string} signature - value of the x-paystack-signature header
 * @returns {boolean} true only when the signature matches
 */
function verifySignature(secret, rawBody, signature) {
  if (!secret || !rawBody || typeof signature !== 'string' || !signature) {
    return false;
  }
  const expected = computeSignature(secret, rawBody);
  let received;
  try {
    // Paystack sends the digest as a lowercase hex string (128 chars).
    if (!/^[0-9a-fA-F]+$/.test(signature)) return false;
    received = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  // timingSafeEqual throws on different lengths, so check first.
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

module.exports = { verifySignature, computeSignature };
