// JSON persistence for subscriptions, per-chat settings and the digest queue.
// File: data/subscriptions.json (created on first run if missing).
// Layout:
// {
//   "subscriptions": { "<chatId>": { "chatId": 123, "title": "Name", "subscribedAt": "ISO" } },
//   "settings":      { "<chatId>": { "level": "all" | "info" | "important" } },
//   "queue":         [ { "message": "...", "level": "info", "at": "ISO", "photoUrl": null } ]
// }
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'subscriptions.json');

const EMPTY = { subscriptions: {}, settings: {}, queue: [] };

function load() {
  try {
    if (!fs.existsSync(STORE_FILE)) return structuredClone(EMPTY);
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return {
      subscriptions: raw.subscriptions && typeof raw.subscriptions === 'object' ? raw.subscriptions : {},
      settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : {},
      queue: Array.isArray(raw.queue) ? raw.queue : [],
    };
  } catch (err) {
    console.error('[store] could not read store, starting empty:', err.message);
    return structuredClone(EMPTY);
  }
}

// Write atomically (temp file + rename) so a crash mid-write never
// leaves a half-written subscriptions.json behind.
function save(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, STORE_FILE);
}

class Store {
  constructor() {
    this.state = load();
  }

  // --- subscriptions -------------------------------------------------
  subscribe(chatId, title) {
    const id = String(chatId);
    const isNew = !this.state.subscriptions[id];
    this.state.subscriptions[id] = {
      chatId: Number(chatId),
      title: title || '',
      subscribedAt: this.state.subscriptions[id]?.subscribedAt || new Date().toISOString(),
    };
    if (isNew && !this.state.settings[id]) {
      this.state.settings[id] = { level: 'all' };
    }
    save(this.state);
    return isNew;
  }

  unsubscribe(chatId) {
    const id = String(chatId);
    const existed = Boolean(this.state.subscriptions[id]);
    delete this.state.subscriptions[id];
    save(this.state);
    return existed;
  }

  isSubscribed(chatId) {
    return Boolean(this.state.subscriptions[String(chatId)]);
  }

  subscribedChatIds() {
    return Object.values(this.state.subscriptions).map((s) => s.chatId);
  }

  subscriberCount() {
    return Object.keys(this.state.subscriptions).length;
  }

  // --- per-chat settings ---------------------------------------------
  getLevel(chatId) {
    return this.state.settings[String(chatId)]?.level || 'all';
  }

  setLevel(chatId, level) {
    this.state.settings[String(chatId)] = { level };
    save(this.state);
  }

  // --- digest queue ---------------------------------------------------
  queueAlert(entry) {
    this.state.queue.push({
      message: entry.message,
      level: entry.level || 'info',
      photoUrl: entry.photoUrl || null,
      at: new Date().toISOString(),
    });
    // Keep the queue bounded so a long quiet stretch can't grow it forever.
    if (this.state.queue.length > 200) {
      this.state.queue = this.state.queue.slice(-200);
    }
    save(this.state);
  }

  takeQueue() {
    const items = this.state.queue;
    this.state.queue = [];
    save(this.state);
    return items;
  }

  queueLength() {
    return this.state.queue.length;
  }
}

module.exports = { Store, STORE_FILE };
