// Next-run calculator for a cron expression, in a given timezone.
//
// node-cron (v3) has no public "next run" API, so the status endpoint
// (/jobs) needs its own. This mirrors node-cron's matching rules exactly:
//   - 5-field expressions are treated as 6-field with seconds = 0.
//   - ALL fields must match (AND), including day-of-month AND day-of-week
//     — unlike classic Vixie cron, node-cron does NOT do "either" for those.
//   - Field values support `*`, lists (1,15), ranges (1-5), steps (*/15,
//     1-30/5) and month / weekday names (JAN, MON, ...).
// Returns a Date (the next run strictly after `from`) or null if nothing
// matches within 5 years (e.g. an impossible date such as 31 Feb).

const MONTH_NAMES = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const DOW_NAMES = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

function parseField(raw, min, max, names) {
  const values = new Set();
  const add = (v) => {
    if (v < min || v > max) throw new Error(`value ${v} out of range ${min}-${max} in "${raw}"`);
    values.add(v);
  };
  for (const part of raw.split(',')) {
    let range = part;
    let step = 1;
    if (part.includes('/')) {
      const split = part.split('/');
      range = split[0];
      step = parseInt(split[1], 10);
      if (!Number.isFinite(step) || step < 1) throw new Error(`bad step in "${raw}"`);
    }
    let lo = min;
    let hi = max;
    if (range === '*') {
      // whole range, stepped
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      lo = resolveValue(a, names);
      hi = resolveValue(b, names);
      if (lo > hi) throw new Error(`bad range "${range}"`);
    } else {
      lo = resolveValue(range, names);
      hi = lo;
    }
    for (let v = lo; v <= hi; v += step) add(v);
  }
  return values;
}

function resolveValue(token, names) {
  const upper = String(token).toUpperCase();
  if (names && upper in names) return names[upper];
  const n = parseInt(token, 10);
  if (!Number.isFinite(n)) throw new Error(`bad cron value "${token}"`);
  return n;
}

// Offset (ms) between the timezone's wall clock and UTC at a given instant.
function tzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = parseInt(p.value, 10);
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

// Convert wall-clock fields in `timeZone` to a real UTC instant.
// (Two offset passes handle DST transitions well enough for scheduling.)
function wallClockToUtc(fields, timeZone) {
  const guess = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second);
  // First pass: offset at the guess. Second pass: offset at the refined
  // instant (handles DST transitions). Both passes subtract from `guess`,
  // not from each other — subtracting twice would double-apply the offset.
  const once = guess - tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - tzOffsetMs(new Date(once), timeZone));
}

// Wall-clock fields of `date` in `timeZone`.
function wallClockParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour: parseInt(parts.hour, 10) % 24,
    minute: parseInt(parts.minute, 10),
    second: parseInt(parts.second, 10),
    dow,
  };
}

function getNextRun(expression, from = new Date(), timeZone = 'Africa/Accra') {
  const rawFields = String(expression).trim().split(/\s+/);
  if (rawFields.length !== 5 && rawFields.length !== 6) {
    throw new Error(`cron expression "${expression}" must have 5 or 6 fields`);
  }
  // node-cron pads 5-field expressions with a leading seconds field of 0.
  const fields = rawFields.length === 5 ? ['0', ...rawFields] : rawFields;
  const second = parseField(fields[0], 0, 59);
  const minute = parseField(fields[1], 0, 59);
  const hour = parseField(fields[2], 0, 23);
  const dom = parseField(fields[3], 1, 31);
  const month = parseField(fields[4], 1, 12, MONTH_NAMES);
  const dowRaw = parseField(fields[5], 0, 7, DOW_NAMES);
  const dow = new Set([...dowRaw].map((d) => (d === 7 ? 0 : d)));

  // Work in "wall clock as if UTC" milliseconds: all arithmetic is done on
  // the timezone's wall-clock fields, converted to a real instant at the end.
  const start = wallClockParts(from, timeZone);
  let cursor = Date.UTC(start.year, start.month - 1, start.day, start.hour, start.minute, start.second) + 1000;

  // Search forward, jumping whole months / days / hours / minutes past
  // non-matching fields instead of stepping one second at a time.
  const deadline = Date.UTC(start.year + 5, start.month - 1, start.day);
  while (cursor <= deadline) {
    const c = new Date(cursor);
    const y = c.getUTCFullYear();
    const mo = c.getUTCMonth() + 1;
    const d = c.getUTCDate();
    const h = c.getUTCHours();
    const mi = c.getUTCMinutes();
    const s = c.getUTCSeconds();
    const weekday = c.getUTCDay();

    if (!month.has(mo)) {
      // Jump to the 1st of the next month that matches.
      let ny = y;
      let nmo = mo;
      do {
        nmo += 1;
        if (nmo > 12) { nmo = 1; ny += 1; }
      } while (!month.has(nmo));
      cursor = Date.UTC(ny, nmo - 1, 1, 0, 0, 0);
      continue;
    }
    if (!dom.has(d) || !dow.has(weekday)) {
      cursor = Date.UTC(y, mo - 1, d + 1, 0, 0, 0);
      continue;
    }
    if (!hour.has(h)) {
      cursor = Date.UTC(y, mo - 1, d, h + 1, 0, 0);
      continue;
    }
    if (!minute.has(mi)) {
      cursor = Date.UTC(y, mo - 1, d, h, mi + 1, 0);
      continue;
    }
    if (!second.has(s)) {
      cursor += 1000;
      continue;
    }
    return wallClockToUtc({ year: y, month: mo, day: d, hour: h, minute: mi, second: s }, timeZone);
  }
  return null; // nothing matched within 5 years (e.g. 31 Feb)
}

module.exports = { getNextRun };
