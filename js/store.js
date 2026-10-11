// Storage interface. Everything is async so this file can later be swapped
// for a Supabase-backed version without touching the rest of the app.
// Data model: one entry per saved session -> { user, date, count, ts }.

import { DEMO } from './config.js';
import { mockEntries } from './demo.js';

const KEY = DEMO ? 'pushups.demo' : 'pushups.v1'; // demo data never touches real data

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function persist(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode) – app still works for this visit */
  }
}

let memory = null; // fallback when localStorage is unavailable
const read = () => memory || load();
const write = (s) => { memory = s; persist(s); };

export const store = {
  async getUser() {
    return read().user || null;
  },

  async setUser(name) {
    const s = read();
    s.user = name;
    if (DEMO && !s.entries?.length) s.entries = mockEntries(name);
    write(s);
  },

  // Demo only: forget the name and sample data so the demo starts over.
  async reset() {
    write({});
  },

  async addEntry(user, date, count) {
    const s = read();
    (s.entries ||= []).push({ user, date, count, ts: Date.now() });
    write(s);
  },

  // Removes the user's most recent entry for the given day. Returns it, or null.
  async removeLastEntry(user, date) {
    const s = read();
    const entries = s.entries || [];
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].user === user && entries[i].date === date) {
        const [removed] = entries.splice(i, 1);
        write(s);
        return removed;
      }
    }
    return null;
  },

  // All of a user's entries, oldest first.
  async entries(user) {
    return (read().entries || []).filter((e) => e.user === user);
  },
};
