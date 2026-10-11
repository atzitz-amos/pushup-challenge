// Sample history for demo mode, relative to today: yours plus two pretend teammates.
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

// Pretend teammates: one who never misses, one who has used both skips.
const TEAMMATES = {
  Lea: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // index = days ago
  Mia: [15, 30, 30, 30, 0, 30, 30, 12, 30, 30],
};

let n = 0;
const fakeId = () => `demo-${n++}`;

export function mockEntries(user, now = new Date()) {
  const entries = [];
  const add = (name, ago, count, h, m) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ago);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
    entries.push({ id: fakeId(), user: name, date: dayKey(day), count, ts: Math.min(at.getTime(), now.getTime()) });
  };
  for (const [ago, sessions] of PLAN) {
    for (const [count, h, m] of sessions) add(user, ago, count, h, m);
  }
  for (const [name, days] of Object.entries(TEAMMATES)) {
    if (name.toLowerCase() === user.trim().toLowerCase()) continue;
    days.forEach((total, ago) => {
      if (total >= 30) {
        add(name, ago, 15, 7, 15);
        add(name, ago, 15, 18, 40);
      } else if (total > 0) {
        add(name, ago, total, 12, 5);
      }
    });
  }
  return entries;
}
