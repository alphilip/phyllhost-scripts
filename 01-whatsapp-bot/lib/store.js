// lib/store.js — tiny JSON-file persistence for bot state.
// Stores per-group settings, warns, opt-in subscribers, custom auto-replies,
// the public/self mode flag and the daily send counter.
// Everything lives in data/store.json (git-ignored, survives restarts).
const fs = require('fs');
const path = require('path');
const config = require('../config');

const STORE_PATH = path.join(config.dataDir, 'store.json');

const DEFAULTS = {
  mode: 'public', // 'public' = anyone can use commands, 'self' = owner only
  groups: {}, // groupJid -> { antilink, welcome, warnLimit }
  warns: {}, // `${groupJid}:${userJid}` -> count
  subscribers: [], // JIDs that opted in to owner announcements (.subscribe)
  autoReplies: { ...config.autoReplies }, // keyword (lowercase) -> reply
  daily: { date: '', sent: 0 } // send counter for the daily cap
};

let data = null;

function load() {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    if (fs.existsSync(STORE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
      data = { ...DEFAULTS, ...raw };
      data.groups = { ...DEFAULTS.groups, ...(raw.groups || {}) };
      data.warns = { ...DEFAULTS.warns, ...(raw.warns || {}) };
      data.autoReplies = { ...DEFAULTS.autoReplies, ...(raw.autoReplies || {}) };
      data.daily = { ...DEFAULTS.daily, ...(raw.daily || {}) };
      if (!Array.isArray(data.subscribers)) data.subscribers = [];
      return data;
    }
  } catch (err) {
    console.error('[store] failed to load, starting fresh:', err.message);
  }
  data = JSON.parse(JSON.stringify(DEFAULTS));
  save();
  return data;
}

function save() {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[store] failed to save:', err.message);
  }
}

function get() {
  if (!data) load();
  return data;
}

// ---- groups ----
function groupSettings(groupJid) {
  const s = get();
  if (!s.groups[groupJid]) {
    s.groups[groupJid] = {
      antilink: config.moderation.antiLink,
      welcome: config.moderation.welcome,
      warnLimit: config.moderation.warnLimit
    };
    save();
  }
  return s.groups[groupJid];
}

function setGroupSetting(groupJid, key, value) {
  const settings = groupSettings(groupJid);
  settings[key] = value;
  save();
  return settings;
}

// ---- warns ----
function warnKey(groupJid, userJid) {
  return `${groupJid}:${userJid}`;
}

function getWarns(groupJid, userJid) {
  return get().warns[warnKey(groupJid, userJid)] || 0;
}

function addWarn(groupJid, userJid) {
  const s = get();
  const key = warnKey(groupJid, userJid);
  s.warns[key] = (s.warns[key] || 0) + 1;
  save();
  return s.warns[key];
}

function clearWarns(groupJid, userJid) {
  const s = get();
  delete s.warns[warnKey(groupJid, userJid)];
  save();
}

// ---- subscribers (opt-in list for owner announcements) ----
function isSubscriber(jid) {
  return get().subscribers.includes(jid);
}

function subscribe(jid) {
  const s = get();
  if (!s.subscribers.includes(jid)) {
    s.subscribers.push(jid);
    save();
    return true;
  }
  return false;
}

function unsubscribe(jid) {
  const s = get();
  const before = s.subscribers.length;
  s.subscribers = s.subscribers.filter((x) => x !== jid);
  if (s.subscribers.length !== before) save();
  return s.subscribers.length !== before;
}

// ---- auto-replies ----
function addAutoReply(keyword, reply) {
  const s = get();
  s.autoReplies[keyword.toLowerCase().trim()] = reply;
  save();
}

function removeAutoReply(keyword) {
  const s = get();
  const key = keyword.toLowerCase().trim();
  if (key in s.autoReplies) {
    delete s.autoReplies[key];
    save();
    return true;
  }
  return false;
}

// ---- daily send counter ----
function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function dailySent() {
  const s = get();
  if (s.daily.date !== todayKey()) {
    s.daily = { date: todayKey(), sent: 0 };
    save();
  }
  return s.daily.sent;
}

function bumpDailySent() {
  const s = get();
  if (s.daily.date !== todayKey()) s.daily = { date: todayKey(), sent: 0 };
  s.daily.sent += 1;
  save();
  return s.daily.sent;
}

module.exports = {
  load,
  save,
  get,
  groupSettings,
  setGroupSetting,
  getWarns,
  addWarn,
  clearWarns,
  isSubscriber,
  subscribe,
  unsubscribe,
  addAutoReply,
  removeAutoReply,
  dailySent,
  bumpDailySent
};
