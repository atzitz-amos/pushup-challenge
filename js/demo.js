// Sample history for demo mode, relative to today.
import { dayKey } from './stats.js';

// [days ago, sessions: [count, hour, minute]]
const PLAN = [
  [9, [[15, 7, 40], [15, 19, 5]]],
  [8, [[30, 8, 10]]],
  [7, [[10, 9, 0], [10, 13, 30], [10, 21, 15]]],
  [6, [[18, 20, 45]]], // missed: uses a skip
  [5, [[22, 20, 0], [8, 22, 5]]],
  [4, [[20, 12, 0], [10, 22, 10]]],
  [3, [[30, 18, 30]]],
  [2, [[12, 8, 20], [18, 17, 50]]],
  [1, [[14, 9, 40], [16, 21, 10]]],
  [0, [[8, 7, 30]]],
];

export function mockEntries(user, now = new Date()) {
  const entries = [];
  for (const [ago, sessions] of PLAN) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ago);
    for (const [count, h, m] of sessions) {
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      entries.push({ user, date: dayKey(day), count, ts: Math.min(at.getTime(), now.getTime()) });
    }
  }
  return entries;
}
