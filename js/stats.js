import { CONFIG } from './config.js';

const pad = (n) => String(n).padStart(2, '0');

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const diffDays = (a, b) => Math.round((b - a) / 864e5); // rounding absorbs DST shifts

// { 'YYYY-MM-DD': total }
export function totalsByDay(entries) {
  const totals = {};
  for (const e of entries) totals[e.date] = (totals[e.date] || 0) + e.count;
  return totals;
}

export function computeStats(totals, now = new Date()) {
  const { goal, allowedMisses } = CONFIG;
  const start = parseDay(CONFIG.startDate);
  const end = parseDay(CONFIG.endDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const done = (d) => (totals[dayKey(d)] || 0) >= goal;

  const totalDays = diffDays(start, end) + 1;
  const dayIndex = Math.min(totalDays, Math.max(0, diffDays(start, today) + 1));

  // Past days (before today) inside the challenge that didn't reach the goal.
  let misses = 0;
  for (let d = start; d < today && d <= end; d = addDays(d, 1)) {
    if (!done(d)) misses++;
  }

  // Consecutive completed days, ending today if done, else yesterday.
  let streak = 0;
  for (let d = done(today) ? today : addDays(today, -1); d >= start && done(d); d = addDays(d, -1)) {
    streak++;
  }

  // Totals so far, and the longest run of completed days (today doesn't break
  // a run while it can still be finished).
  let completedDays = 0;
  let totalPushups = 0;
  let bestStreak = 0;
  for (let d = start, run = 0; d <= end && d <= today; d = addDays(d, 1)) {
    totalPushups += totals[dayKey(d)] || 0;
    if (done(d)) {
      completedDays++;
      bestStreak = Math.max(bestStreak, ++run);
    } else if (d < today) {
      run = 0;
    }
  }

  return {
    goal,
    totalDays,
    dayIndex,
    misses,
    missesLeft: allowedMisses - misses,
    streak,
    bestStreak,
    completedDays,
    totalPushups,
    todayTotal: totals[dayKey(today)] || 0,
  };
}
