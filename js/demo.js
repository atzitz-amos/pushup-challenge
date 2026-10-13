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

// A pretend team to try the team page with: join it again with code DEMO42.
export const DEMO_TEAM = { code: 'DEMO42', name: 'Demo team' };

// Pretend teammates: one who never misses, one who has used both skips.
const TEAMMATES = {
  Lea: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // index = days ago
  Mia: [15, 30, 30, 30, 0, 30, 30, 12, 30, 30],
};

export const DEMO_MATES = Object.keys(TEAMMATES);

let n = 0;
const fakeId = () => `demo-${n++}`;

export function mockEntries(user, now = new Date()) {
  const entries = [];
  const add = (name, ago, count, h, m) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ago);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
    entries.push({ id: fakeId(), user: name, date: dayKey(day), count, ts: Math.min(at.getTime(), now.getTime()), team: DEMO_TEAM.code, up: true });
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

// Sample reactions and comments between you and the pretend teammates.
// [whose day ('me' = you), days ago, author ('me' = you), emoji or null, comment or null, hour, minute]
const CHEERS = [
  ['me', 1, 'Lea', '🔥', null, 21, 30],
  ['me', 1, 'Mia', '💪', null, 21, 40],
  ['#team', 1, 'Lea', null, 'Two sets and done, nice 👏', 21, 32],
  ['Lea', 1, 'me', '🔥', null, 19, 0],
  ['Lea', 1, 'Mia', '❤️', null, 19, 10],
  ['Mia', 2, 'Lea', '👏', null, 20, 0],
  ['Lea', 0, 'Mia', '😂', null, 7, 25],
  ['#team', 0, 'Mia', null, 'Already?! It\'s 7am 😳', 7, 26],
  ['#team', 0, 'Lea', null, 'Early bird 🐦', 7, 31],
  ['#team', 0, 'Mia', null, 'Doing mine at lunch 🥪', 7, 33],
  ['me', 0, 'Mia', '💪', null, 7, 45],
];

export function mockCheers(user, now = new Date()) {
  const who = (name) => (name === 'me' ? user : name);
  return CHEERS
    .filter(([owner, , author]) => ![owner, author].some((n) => n !== 'me' && n !== '#team' && n.toLowerCase() === user.trim().toLowerCase()))
    .map(([owner, ago, author, emoji, body, h, m]) => {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ago);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      return {
        id: fakeId(), team: DEMO_TEAM.code, owner: who(owner), day: dayKey(day), author: who(author),
        emoji, body, ts: Math.min(at.getTime(), now.getTime() - 60000), up: true,
      };
    });
}
