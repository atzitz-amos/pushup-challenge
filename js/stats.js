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

  // Until lateLogUntilHour, an unfinished yesterday is still pending rather than missed.
  const yesterday = addDays(today, -1);
  const graceKey = now.getHours() < CONFIG.lateLogUntilHour && yesterday >= start && yesterday <= end && !done(yesterday)
    ? dayKey(yesterday)
    : null;

  // Past days (before today) inside the challenge that didn't reach the goal.
  let misses = 0;
  for (let d = start; d < today && d <= end; d = addDays(d, 1)) {
    if (!done(d) && dayKey(d) !== graceKey) misses++;
  }

  // Consecutive completed days, ending today if done, else yesterday
  // (or the day before, while yesterday is still pending).
  let from = done(today) ? today : yesterday;
  if (dayKey(from) === graceKey) from = addDays(from, -1);
  let streak = 0;
  for (let d = from; d >= start && done(d); d = addDays(d, -1)) {
    streak++;
  }

  return {
    goal,
    totalDays,
    dayIndex,
    misses,
    missesLeft: allowedMisses - misses,
    streak,
    graceKey,
    todayTotal: totals[dayKey(today)] || 0,
  };
}
