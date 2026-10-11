// Sisters panel: one card per person with today's progress, streak, skips left
// and their last seven days, built from everyone's synced entries.
import { CONFIG } from './config.js';
import { computeStats, totalsByDay, dayKey, addDays, parseDay } from './stats.js';
import { sameName } from './store.js';

const weekdayFmt = new Intl.DateTimeFormat('en', { weekday: 'narrow' });

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function people(entries, me) {
  const groups = [];
  for (const e of entries) {
    let g = groups.find((x) => sameName(x.name, e.user));
    if (!g) groups.push((g = { name: e.user, entries: [] }));
    g.entries.push(e);
  }
  if (me && !groups.some((g) => sameName(g.name, me))) groups.push({ name: me, entries: [] });
  return groups.map((g) => {
    const totals = totalsByDay(g.entries);
    return { name: g.name, totals, stats: computeStats(totals), isMe: sameName(g.name, me) };
  });
}

function weekStrip(totals) {
  const { goal } = CONFIG;
  const start = parseDay(CONFIG.startDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const strip = el('div', 'sis-week');
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const day = el('span', 'sis-day');
    const total = totals[dayKey(d)] || 0;
    if (d < start) day.classList.add('before');
    else if (total >= goal) day.classList.add('done');
    else if (i === 0) day.classList.add('today');
    else day.classList.add('missed');
    day.style.setProperty('--p', Math.min(1, total / goal));
    day.append(el('i'), el('small', null, weekdayFmt.format(d)));
    strip.appendChild(day);
  }
  return strip;
}

export function renderSisters(root, { entries, me, status }) {
  const { goal } = CONFIG;
  const list = people(entries, me).sort((a, b) =>
    (b.stats.todayTotal >= goal) - (a.stats.todayTotal >= goal)
    || b.stats.streak - a.stats.streak
    || b.stats.todayTotal - a.stats.todayTotal);

  const cards = list.map((p) => {
    const { todayTotal, streak, missesLeft } = p.stats;
    const card = el('div', `sis${p.isMe ? ' me' : ''}${todayTotal >= goal ? ' sis-done' : ''}`);

    const avatar = el('div', 'sis-avatar', [...p.name][0]?.toUpperCase() ?? '?');
    avatar.style.setProperty('--p', Math.min(1, todayTotal / goal));

    const main = el('div', 'sis-main');
    const name = el('b', null, p.name);
    if (p.isMe) name.appendChild(el('em', null, 'you'));
    main.append(name, el('span', null, todayTotal >= goal ? 'Done today 🎉' : `${todayTotal} of ${goal} today`));

    const stats = el('div', 'sis-stats');
    stats.append(el('span', null, `🔥 ${streak}`), el('span', null, `${missesLeft > 0 ? '💜' : '💔'} ${Math.max(0, missesLeft)}`));

    const top = el('div', 'sis-top');
    top.append(avatar, main, stats);
    card.append(top, weekStrip(p.totals));
    return card;
  });

  root.replaceChildren(el('p', 'sis-status', status), ...cards);
}
