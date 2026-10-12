// Entries live in localStorage, so the app opens instantly and works offline.
// Once you are in a team (and Supabase is configured), your entries are uploaded
// to that team and everyone's entries in the team are downloaded. Saves and undos
// are queued and uploaded in the background; failed uploads retry on the next sync.
//
// Entry: { id, user, date, count, ts, team, up }
//   team: code of the team it belongs to (null before joining one)
//   up:   whether it is stored on the server for that team
//
// Cheer (a reaction or a comment on someone's day, only inside a team):
//   { id, team, owner, day, author, emoji, body, ts, up }
//   owner: whose day it is; emoji for a reaction, body for a comment (the other is null)

import { DEMO, SUPABASE, DEFAULT_RULES, FEATURES } from './config.js';
import { mockEntries, mockCheers, DEMO_TEAM, DEMO_MATES } from './demo.js';

const KEY = DEMO ? 'pushups.demo' : 'pushups.v1'; // demo data never touches real data
const SERVER = !DEMO && !!(SUPABASE.url && SUPABASE.anonKey);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // same alphabet as the server

// Names are the identity within a team: the same name on another device is the same person.
export const sameName = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
export const normalizeCode = (code) => (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

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
  s.removed ||= []; // ids undone here but not deleted on the server yet
  s.team ||= null;
  s.cheers ||= [];
  s.cheersRemoved ||= []; // ids removed here but not deleted on the server yet
  s.cheersSeen ||= 0; // when the team page was last opened (for the unread dot)
  // Demos started before cheers existed get the sample ones too.
  if (DEMO && s.user && !s.cheersDemo) {
    s.cheers = mockCheers(s.user);
    s.cheersDemo = true;
  }
  // Data from before teams: nothing is in a team yet, so everything uploads on joining one.
  if (!s.v2) {
    for (const e of s.entries) {
      e.id ||= uid();
      e.team = null;
      e.up = false;
    }
    delete s.pending;
    s.removed = [];
    s.v2 = true;
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

const mine = (e) => sameName(e.user, state.user);

/* ---------- Supabase (database functions over fetch, no library needed) ---------- */

export async function rpc(fn, args) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE.url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        apikey: SUPABASE.anonKey,
        // Legacy anon keys are JWTs (eyJ…) and also go in Authorization; the newer
        // publishable keys (sb_publishable_…) must only be sent as apikey.
        ...(SUPABASE.anonKey.startsWith('eyJ') ? { Authorization: `Bearer ${SUPABASE.anonKey}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

const toRow = (e) => ({ id: e.id, user_name: e.user, day: e.date, count: e.count, created_at: new Date(e.ts).toISOString() });
const fromRow = (r, team) => ({ id: r.id, user: r.user_name, date: r.day, count: r.count, ts: Date.parse(r.created_at), team, up: true });

// Uploads queued saves and undos for the current team. Concurrent calls share one run.
let flushing = null;
function flush() {
  if (!SERVER || !state.team) return Promise.resolve();
  flushing ||= (async () => {
    const code = state.team.code;
    const up = state.entries.filter((e) => mine(e) && !e.up && e.team === code);
    if (up.length) {
      await rpc('add_entries', { p_code: code, p_rows: up.map(toRow) });
      for (const e of up) e.up = true;
      persist();
    }
    if (state.removed.length) {
      const ids = [...state.removed];
      await rpc('remove_entries', { p_code: code, p_ids: ids });
      state.removed = state.removed.filter((id) => !ids.includes(id));
      persist();
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

const toCheerRow = (c) => ({
  id: c.id, owner: c.owner, day: c.day, author: c.author, emoji: c.emoji ?? null, body: c.body ?? null,
  created_at: new Date(c.ts).toISOString(),
});
const fromCheerRow = (r, team) => ({
  id: r.id, team, owner: r.owner, day: r.day, author: r.author, emoji: r.emoji, body: r.body, ts: Date.parse(r.created_at), up: true,
});
const wroteIt = (c) => sameName(c.author, state.user);
const sameThread = (c, owner, day) => c.day === day && sameName(c.owner, owner);

// Uploads queued reactions, comments and removals (same idea as flush()).
let flushingCheers = null;
function flushCheers() {
  if (!SERVER || !state.team || !FEATURES.cheers) return Promise.resolve();
  flushingCheers ||= (async () => {
    const code = state.team.code;
    const up = state.cheers.filter((c) => c.team === code && !c.up && wroteIt(c));
    if (up.length) {
      await rpc('add_cheers', { p_code: code, p_rows: up.map(toCheerRow) });
      for (const c of up) c.up = true;
      persist();
    }
    if (state.cheersRemoved.length) {
      const ids = [...state.cheersRemoved];
      await rpc('remove_cheers', { p_code: code, p_name: state.user, p_ids: ids });
      state.cheersRemoved = state.cheersRemoved.filter((id) => !ids.includes(id));
      persist();
    }
  })().finally(() => {
    flushingCheers = null;
  });
  return flushingCheers;
}

// Team rules as the server sends them → the app's rules object.
const rulesOf = (t) => (t && t.goal != null
  ? { goal: t.goal, allowedMisses: t.allowed_misses, endDate: t.end_date }
  : undefined);
const asTeam = (t) => ({ code: t.code, name: t.name, rules: t.rules || rulesOf(t) });

const byTime = (a, b) => a.ts - b.ts;
const signature = (list) => list.map((e) => `${e.id}:${e.count}`).sort().join('|');
const randomCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/* ---------- Public interface ---------- */

export const store = {
  lastSync: 0,

  // Team features exist (a real server, or the pretend one in demo mode).
  hasTeams: SERVER || DEMO,
  // Entries are currently being shared with a server.
  get isRemote() {
    return SERVER && !!state.team;
  },
  get team() {
    return state.team;
  },

  // The rules in effect: your team's when you are in one, otherwise your own.
  get rules() {
    return { ...DEFAULT_RULES, ...(state.team ? state.team.rules : state.rules) };
  },
  get rulesAreShared() {
    return !!state.team;
  },

  // Saves new rules: for the whole team when in one (needs the server), otherwise just yours.
  async saveRules(rules) {
    if (!state.team) {
      state.rules = rules;
    } else if (SERVER) {
      const t = await rpc('update_team_rules', {
        p_code: state.team.code, p_goal: rules.goal, p_allowed_misses: rules.allowedMisses, p_end_date: rules.endDate,
      });
      state.team.rules = rulesOf(t);
    } else {
      state.team.rules = rules;
    }
    persist();
  },

  async getUser() {
    return state.user || null;
  },

  async setUser(name) {
    state.user = name;
    if (DEMO && !state.entries.length) {
      state.entries = mockEntries(name);
      state.team = { ...DEMO_TEAM };
      state.cheers = mockCheers(name);
      state.cheersDemo = true;
    }
    persist();
  },

  // Demo only: forget the name and sample data so the demo starts over.
  async reset() {
    state = { entries: [], removed: [], team: null, v2: true, cheers: [], cheersRemoved: [], cheersSeen: 0 };
    persist();
  },

  // Deletes all your push-ups: in your team on the server first (so they don't
  // come back on the next sync), then on this phone. Throws when offline.
  async resetProgress() {
    if (SERVER && state.team) await rpc('reset_entries', { p_code: state.team.code, p_name: state.user });
    state.entries = state.entries.filter((e) => !mine(e));
    state.removed = [];
    persist();
  },

  // Forgets everything on this phone (name, team, rules, push-ups) after leaving the team.
  // What you saved in the team stays there.
  async startOver() {
    await this.leaveTeam();
    await this.reset();
  },

  async addEntry(user, date, count) {
    const entry = { id: uid(), user, date, count, ts: Date.now(), team: state.team?.code ?? null, up: false };
    state.entries.push(entry);
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
        if (e.up && e.team === state.team?.code) state.removed.push(e.id);
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

  // Names of everyone in your team, including people who haven't logged anything yet.
  // The server's member list decides when there is one (people who left aren't shown);
  // otherwise (demo, not synced yet) whoever has entries.
  teamMembers() {
    const names = [...(state.team?.members || [])];
    if (!state.team?.members) for (const e of this.teamEntries()) if (!names.some((n) => sameName(n, e.user))) names.push(e.user);
    if (state.user && !names.some((n) => sameName(n, state.user))) names.push(state.user);
    return names;
  },

  // Entries of everyone in your team, plus yours (for the team page).
  teamEntries() {
    let list = state.entries;
    if (DEMO && state.team?.code !== DEMO_TEAM.code) list = list.filter(mine);
    return [...list].sort(byTime);
  },

  /* --- Teams --- */

  // Finds a team by code. Returns { team, members } (members: names already in it), or null.
  async lookupTeam(code) {
    code = normalizeCode(code);
    if (DEMO) return code === DEMO_TEAM.code ? { team: asTeam(DEMO_TEAM), members: DEMO_MATES } : null;
    const found = await rpc('find_team', { p_code: code });
    if (!found) return null;
    const team = asTeam(found);
    const rows = await rpc('team_members', { p_code: code });
    return { team, members: rows.map((r) => r.user_name) };
  },

  // Creates a team, starting with your current rules, and returns it (call joinTeam with it to enter it).
  async createTeam(name) {
    const rules = this.rules;
    if (DEMO) return { code: randomCode(), name: name.trim(), rules };
    const t = await rpc('create_team', { p_name: name });
    const updated = await rpc('update_team_rules', {
      p_code: t.code, p_goal: rules.goal, p_allowed_misses: rules.allowedMisses, p_end_date: rules.endDate,
    });
    return asTeam(updated);
  },

  // Enters a team. Your entries come along: anything not yet stored in this team
  // is uploaded to it (with a fresh id if it already lives in another team).
  async joinTeam(team) {
    // What the team already has from you (e.g. you were in it before, or another device):
    // those entries are reused instead of uploaded twice.
    const existing = SERVER ? await rpc('team_entries', { p_code: team.code }) : [];
    if (SERVER) await rpc('join_team', { p_code: team.code, p_name: state.user });
    state.team = { code: team.code, name: team.name, rules: team.rules };
    if (!DEMO) state.entries = state.entries.filter(mine); // other teams' people go
    for (const e of state.entries) {
      if (!mine(e) || e.team === team.code) continue;
      const same = existing.find((r) => sameName(r.user_name, e.user) && r.day === e.date
        && r.count === e.count && Math.abs(Date.parse(r.created_at) - e.ts) < 1000);
      if (same) {
        e.id = same.id;
        e.up = true;
      } else {
        if (e.up) e.id = uid(); // already stored in another team: needs its own id here
        e.up = false;
      }
      e.team = team.code;
    }
    state.removed = [];
    if (!DEMO) state.cheers = [];
    state.cheersRemoved = [];
    this.cheersSynced = false;
    persist();
    if (SERVER) await this.sync();
  },

  async leaveTeam() {
    if (SERVER && state.team) {
      // Best effort: leaving still works offline, the team just keeps listing you.
      await rpc('leave_team', { p_code: state.team.code, p_name: state.user }).catch((err) => console.warn('Leave failed:', err));
    }
    state.team = null;
    if (!DEMO) state.entries = state.entries.filter(mine);
    state.removed = [];
    if (!DEMO) state.cheers = [];
    state.cheersRemoved = [];
    persist();
  },

  // Uploads anything queued, then reloads the team's entries and rules from the server.
  // Returns { ok, changed, rulesChanged }; ok is false when offline or misconfigured.
  async sync() {
    if (!this.isRemote) return { ok: true, changed: false };
    const code = state.team.code;
    try {
      await flush();
      const [rows, info, members] = await Promise.all([
        rpc('team_entries', { p_code: code }),
        rpc('find_team', { p_code: code }),
        rpc('team_members', { p_code: code }),
      ]);
      if (state.team?.code !== code) return { ok: true, changed: false }; // left meanwhile
      if (!info) {
        // The team was deleted: drop back to having no team, keeping your own entries.
        const gone = state.team.name;
        state.team = null;
        state.entries = state.entries.filter(mine);
        state.removed = [];
        persist();
        return { ok: true, changed: true, rulesChanged: true, teamGone: gone };
      }
      const beforeRules = JSON.stringify(this.rules);
      if (info) {
        state.team.name = info.name;
        state.team.rules = rulesOf(info) || state.team.rules;
      }
      const rulesChanged = JSON.stringify(this.rules) !== beforeRules;
      state.team.members = members.map((m) => m.user_name);
      // Joined before the member list existed (or it failed then): register now.
      if (!state.team.members.some((n) => sameName(n, state.user))) {
        await rpc('join_team', { p_code: code, p_name: state.user });
        state.team.members.push(state.user);
      }
      const before = signature(state.entries);
      const known = new Set(state.entries.map((e) => e.id));
      const server = rows.map((r) => fromRow(r, code)).filter((e) => !state.removed.includes(e.id));
      // Teammates' saves from the last minutes that this phone hasn't seen yet (not on the first sync).
      const news = this.lastSync
        ? server.filter((e) => !known.has(e.id) && !mine(e) && Date.now() - e.ts < 15 * 60 * 1000)
        : [];
      const waiting = state.entries.filter((e) => mine(e) && !e.up && !server.some((s) => s.id === e.id));
      state.entries = [...server, ...waiting];
      persist();
      this.lastSync = Date.now();
      const cheers = await this.syncCheers();
      return { ok: true, changed: signature(state.entries) !== before, rulesChanged, news, cheers };
    } catch (err) {
      console.warn('Sync failed:', err);
      return { ok: false, changed: false };
    }
  },

  /* --- Cheers: reactions and comments on each other's days --- */

  cheersSynced: false,

  // Cheers are available: the feature is on and you are in a team.
  get cheersOn() {
    return FEATURES.cheers && !!state.team;
  },

  // The team's reactions and comments, oldest first.
  cheers() {
    if (!this.cheersOn) return [];
    return state.cheers.filter((c) => c.team === state.team.code).sort(byTime);
  },

  // Adds your reaction to someone's day, or takes it back. Returns true when added.
  toggleReaction(owner, day, emoji) {
    const existing = this.cheers().find((c) => sameThread(c, owner, day) && wroteIt(c) && c.emoji === emoji);
    if (existing) {
      this.removeCheer(existing.id);
      return false;
    }
    this.addCheer({ owner, day, emoji, body: null });
    return true;
  },

  addComment(owner, day, body) {
    return this.addCheer({ owner, day, emoji: null, body: body.trim().slice(0, 300) });
  },

  addCheer({ owner, day, emoji, body }) {
    const cheer = { id: uid(), team: state.team.code, owner, day, author: state.user, emoji, body, ts: Date.now(), up: DEMO };
    state.cheers.push(cheer);
    persist();
    flushCheers().catch((err) => console.warn('Cheer upload failed, will retry:', err));
    return cheer;
  },

  // Removes one of your reactions or comments.
  removeCheer(id) {
    const i = state.cheers.findIndex((c) => c.id === id && wroteIt(c));
    if (i < 0) return;
    state.cheers.splice(i, 1);
    // Also when not uploaded yet: an upload may be on its way (deleting a missing id is harmless).
    if (!DEMO) state.cheersRemoved.push(id);
    persist();
    flushCheers().catch((err) => console.warn('Cheer removal failed, will retry:', err));
  },

  // Whether a cheer is news for you: about your day, or a comment in a thread you wrote in.
  concernsMe(c) {
    if (wroteIt(c)) return false;
    if (sameName(c.owner, state.user)) return true;
    return !!c.body && this.cheers().some((x) => x.body && wroteIt(x) && sameThread(x, c.owner, c.day));
  },

  // Cheers for you that arrived since the team page was last opened.
  unreadCheers() {
    return this.cheers().filter((c) => c.ts > state.cheersSeen && this.concernsMe(c)).length;
  },

  markCheersSeen() {
    state.cheersSeen = Date.now();
    persist();
  },

  // Uploads your queued cheers and reloads the team's. Returns { ok, changed, news }:
  // news are new cheers for you (not on the first load).
  async syncCheers() {
    const none = { ok: true, changed: false, news: [] };
    if (!SERVER || !this.cheersOn) return none;
    const code = state.team.code;
    try {
      await flushCheers();
      const rows = await rpc('team_cheers', { p_code: code });
      if (state.team?.code !== code) return none;
      const sig = (list) => list.map((c) => c.id).sort().join('|');
      const before = sig(state.cheers);
      const known = new Set(state.cheers.map((c) => c.id));
      const server = rows.map((r) => fromCheerRow(r, code)).filter((c) => !state.cheersRemoved.includes(c.id));
      const waiting = state.cheers.filter((c) => c.team === code && wroteIt(c) && !c.up && !server.some((s) => s.id === c.id));
      state.cheers = [...server, ...waiting];
      const news = this.cheersSynced ? server.filter((c) => !known.has(c.id) && this.concernsMe(c)) : [];
      this.cheersSynced = true;
      persist();
      return { ok: true, changed: sig(state.cheers) !== before, news };
    } catch (err) {
      console.warn('Cheers sync failed:', err);
      return { ok: false, changed: false, news: [] };
    }
  },
};
