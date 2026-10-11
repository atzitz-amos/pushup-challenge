// Entries live in localStorage, so the app opens instantly and works offline.
// When Supabase is configured they are also synced with a shared table, so
// everyone sees each other's progress. Saves and undos are queued and uploaded
// in the background; a failed upload is retried on the next sync.
// Entry: { id, user, date, count, ts }.

import { CONFIG, DEMO, SUPABASE } from './config.js';
import { mockEntries } from './demo.js';

const KEY = DEMO ? 'pushups.demo' : 'pushups.v1'; // demo data never touches real data
const REMOTE = !DEMO && !!(SUPABASE.url && SUPABASE.anonKey);

// Names are the identity: the same name on another device is the same person.
export const sameName = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

// crypto.randomUUID only exists on https; the phone test server is plain http.
function uid() {
  if (crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch { /* insecure context */ }
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* ---------- Local cache ---------- */

function load() {
  let s;
  try {
    s = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    s = {};
  }
  s.entries ||= [];
  s.pending ||= []; // ids saved here but not uploaded yet
  s.removed ||= []; // ids undone here but not deleted on the server yet
  // Entries from before syncing existed have no id: give them one and upload them.
  for (const e of s.entries) {
    if (!e.id) {
      e.id = uid();
      s.pending.push(e.id);
    }
  }
  return s;
}

let state = load();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode): keeps working for this visit */
  }
}

/* ---------- Supabase (PostgREST over fetch, no library needed) ---------- */

async function api(path, { method = 'GET', body, prefer } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE.url.replace(/\/$/, '')}/rest/v1/${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        apikey: SUPABASE.anonKey,
        Authorization: `Bearer ${SUPABASE.anonKey}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return method === 'GET' ? res.json() : null;
  } finally {
    clearTimeout(timer);
  }
}

const toRow = (e) => ({ id: e.id, user_name: e.user, day: e.date, count: e.count, created_at: new Date(e.ts).toISOString() });
const fromRow = (r) => ({ id: r.id, user: r.user_name, date: r.day, count: r.count, ts: Date.parse(r.created_at) });

// Uploads queued saves and deletes. Concurrent calls share one run.
let flushing = null;
function flush() {
  if (!REMOTE) return Promise.resolve();
  flushing ||= (async () => {
    const up = state.entries.filter((e) => state.pending.includes(e.id));
    if (up.length) {
      // ignore-duplicates: an upload that succeeded but whose reply got lost is harmless to resend.
      await api('entries', { method: 'POST', body: up.map(toRow), prefer: 'resolution=ignore-duplicates,return=minimal' });
      state.pending = state.pending.filter((id) => !up.some((e) => e.id === id));
      persist();
    }
    if (state.removed.length) {
      const ids = [...state.removed];
      await api(`entries?id=in.(${ids.join(',')})`, { method: 'DELETE' });
      state.removed = state.removed.filter((id) => !ids.includes(id));
      persist();
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

const byTime = (a, b) => a.ts - b.ts;
const signature = (list) => list.map((e) => `${e.id}:${e.count}`).sort().join('|');

/* ---------- Public interface ---------- */

export const store = {
  isRemote: REMOTE,
  lastSync: 0,

  async getUser() {
    return state.user || null;
  },

  async setUser(name) {
    state.user = name;
    if (DEMO && !state.entries.length) state.entries = mockEntries(name);
    persist();
  },

  // Demo only: forget the name and sample data so the demo starts over.
  async reset() {
    state = { entries: [], pending: [], removed: [] };
    persist();
  },

  async addEntry(user, date, count) {
    const entry = { id: uid(), user, date, count, ts: Date.now() };
    state.entries.push(entry);
    state.pending.push(entry.id);
    persist();
    flush().catch((err) => console.warn('Upload failed, will retry:', err));
    return entry;
  },

  // Removes the user's most recent entry for the given day. Returns it, or null.
  async removeLastEntry(user, date) {
    for (let i = state.entries.length - 1; i >= 0; i--) {
      const e = state.entries[i];
      if (sameName(e.user, user) && e.date === date) {
        state.entries.splice(i, 1);
        if (state.pending.includes(e.id)) state.pending = state.pending.filter((id) => id !== e.id);
        else state.removed.push(e.id);
        persist();
        flush().catch((err) => console.warn('Undo upload failed, will retry:', err));
        return e;
      }
    }
    return null;
  },

  // One person's entries, oldest first.
  async entries(user) {
    return state.entries.filter((e) => sameName(e.user, user)).sort(byTime);
  },

  // Everyone's entries (for the team page).
  allEntries() {
    return [...state.entries].sort(byTime);
  },

  // Uploads anything queued, then reloads everyone's entries from the server.
  // Returns { ok, changed }; ok is false when offline or misconfigured.
  async sync() {
    if (!REMOTE) return { ok: true, changed: false };
    try {
      await flush();
      const rows = await api(`entries?select=id,user_name,day,count,created_at&day=gte.${CONFIG.startDate}&order=created_at.asc&limit=20000`);
      const before = signature(state.entries);
      const server = rows.map(fromRow).filter((e) => !state.removed.includes(e.id));
      const local = state.entries.filter((e) => state.pending.includes(e.id) && !server.some((s) => s.id === e.id));
      state.entries = [...server, ...local];
      persist();
      this.lastSync = Date.now();
      return { ok: true, changed: signature(state.entries) !== before };
    } catch (err) {
      console.warn('Sync failed:', err);
      return { ok: false, changed: false };
    }
  },
};
