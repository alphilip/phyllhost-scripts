// lib/utils.js — general utilities: .qr, .wiki, .calc, .translate.
// .calc uses a hand-written recursive-descent parser — never eval().
const axios = require('axios');
const QRCode = require('qrcode');

/** .qr <text> — render text as a QR code image (PNG buffer). */
async function makeQrBuffer(text) {
  if (!text || text.length > 1000) throw new Error('Give me some text (up to 1000 characters).');
  return QRCode.toBuffer(text, { type: 'png', width: 512, margin: 2 });
}

/** .wiki <topic> — short Wikipedia summary via the public REST API. */
async function wikiSummary(topic) {
  if (!topic) throw new Error('Usage: .wiki <topic>');
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
  const { data } = await axios.get(url, {
    timeout: 15000,
    headers: { 'User-Agent': 'whatsapp-bot/1.0 (contact: owner)' }
  });
  if (data.type === 'disambiguation' || !data.extract) {
    throw new Error(`No clear Wikipedia article for "${topic}". Try a more specific title.`);
  }
  let out = `*${data.title}*\n\n${data.extract}`;
  if (data.content_urls?.desktop?.page) out += `\n\n${data.content_urls.desktop.page}`;
  return out.length > 1500 ? out.slice(0, 1500) + '…' : out;
}

/** .translate <lang> <text> — free translation via the MyMemory API (no key). */
async function translate(targetLang, text) {
  if (!targetLang || !text) throw new Error('Usage: .translate <lang> <text>\nExample: .translate fr Hello, how are you?');
  const lang = targetLang.toLowerCase();
  const { data } = await axios.get('https://api.mymemory.translated.net/get', {
    params: { q: text, langpair: `auto|${lang}` },
    timeout: 15000
  });
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error('Translation failed — try again in a moment.');
  return translated;
}

// ---- safe calculator: recursive-descent parser, no eval ----
// Grammar: expr := term (('+'|'-') term)*
//          term := factor (('*'|'/'|'%') factor)*
//          factor := power ('^' power)*
//          power := ('-'|'+')? atom
//          atom := number | '(' expr ')' | func '(' expr ')' | func '(' expr ',' expr ')'
//          funcs: sqrt, sin, cos, tan, log, ln, abs, pow
const FUNCS = {
  sqrt: (x) => Math.sqrt(x),
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  log: (x) => Math.log10(x),
  ln: (x) => Math.log(x),
  abs: (x) => Math.abs(x),
  pow: (x, y) => Math.pow(x, y)
};

function tokenize(input) {
  const tokens = [];
  const re = /\s*(\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[+\-*/%^(),])/g;
  let m;
  let consumed = 0;
  while ((m = re.exec(input)) !== null) {
    if (m.index !== consumed) throw new Error(`Unexpected character at position ${consumed}`);
    consumed = re.lastIndex;
    tokens.push(m[1]);
  }
  if (consumed !== input.trim().length) throw new Error('Could not parse expression.');
  return tokens;
}

function calc(expression) {
  if (!expression) throw new Error('Usage: .calc <expression>\nExample: .calc (12 + 8) * 3 / 2');
  if (!/^[\d\s+\-*/%^().,A-Za-z_]+$/.test(expression)) {
    throw new Error('Only numbers, + - * / % ^ ( ) and functions (sqrt, sin, cos, tan, log, ln, abs, pow) are allowed.');
  }
  const tokens = tokenize(expression);
  let pos = 0;

  function peek() { return tokens[pos]; }
  function next() { return tokens[pos++]; }

  function parseExpr() {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm() {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const rhs = parseFactor();
      if (op === '*') value *= rhs;
      else if (op === '/') {
        if (rhs === 0) throw new Error('Division by zero.');
        value /= rhs;
      } else value %= rhs;
    }
    return value;
  }

  function parseFactor() {
    let value = parsePower();
    while (peek() === '^') {
      next();
      value = Math.pow(value, parsePower());
    }
    return value;
  }

  function parsePower() {
    if (peek() === '-') { next(); return -parsePower(); }
    if (peek() === '+') { next(); return parsePower(); }
    return parseAtom();
  }

  function parseAtom() {
    const tok = next();
    if (tok === undefined) throw new Error('Unexpected end of expression.');
    if (tok === '(') {
      const value = parseExpr();
      if (next() !== ')') throw new Error('Missing closing parenthesis.');
      return value;
    }
    if (/^\d/.test(tok)) return Number(tok);
    if (/^[A-Za-z_]/.test(tok)) {
      const fn = FUNCS[tok.toLowerCase()];
      if (!fn) throw new Error(`Unknown function "${tok}". Available: ${Object.keys(FUNCS).join(', ')}`);
      if (next() !== '(') throw new Error(`Expected "(" after ${tok}.`);
      const args = [parseExpr()];
      if (peek() === ',') { next(); args.push(parseExpr()); }
      if (next() !== ')') throw new Error('Missing closing parenthesis.');
      const result = fn(...args);
      if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('Result is not a finite number.');
      return result;
    }
    throw new Error(`Unexpected token "${tok}".`);
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error(`Unexpected token "${tokens[pos]}".`);
  if (!Number.isFinite(result)) throw new Error('Result is not a finite number.');
  return result;
}

module.exports = { makeQrBuffer, wikiSummary, translate, calc };
