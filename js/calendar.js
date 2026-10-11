// Calendar panel: one month per page (swipe or use the arrows), each day a tile
// that fills from the bottom with that day's progress. Tapping a day calls onPick(dayKey).
import { CONFIG } from './config.js';
import { dayKey, parseDay, diffDays } from './stats.js';

const monthFmt = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
const longFmt = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' });
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function legendItem(cls, label) {
  const item = el('span', 'cal-legend-item');
  item.append(el('i', `cal-swatch ${cls}`), label);
  return item;
}

function stat(value, label) {
  const s = el('span');
  s.append(el('b', null, value), ` ${label}`);
  return s;
}

function monthPage(m, { start, end, today, totals, stats }) {
  const { goal } = CONFIG;
  const page = el('div', 'cal-page');
  const wds = el('div', 'cal-wds');
  for (const w of WEEKDAYS) wds.appendChild(el('span', null, w));
  const grid = el('div', 'cal-grid');
  for (let i = (m.getDay() + 6) % 7; i > 0; i--) grid.appendChild(el('span'));

  const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  for (let n = 1; n <= daysInMonth; n++) {
    const date = new Date(m.getFullYear(), m.getMonth(), n);
    const key = dayKey(date);
    if (date < start || date > end) {
      grid.appendChild(el('span', 'cal-tile out', n));
      continue;
    }
    const total = totals[key] || 0;
    const rel = diffDays(today, date);
    const tile = el('button', 'cal-tile');
    tile.type = 'button';
    tile.dataset.key = key;
    tile.dataset.p = Math.min(1, total / goal);
    tile.append(el('span', 'fill'), el('span', 'n', n));

    if (total >= goal) tile.classList.add('done');
    else if (rel > 0) tile.classList.add('future');
    else if (key === stats.graceKey) tile.classList.add('pending');
    else if (rel < 0) tile.classList.add('missed');
    if (rel === 0) tile.classList.add('today');
    if (key === CONFIG.endDate) tile.classList.add('xmas');

    const state = rel > 0 ? 'upcoming'
      : total >= goal ? 'completed'
      : rel === 0 || key === stats.graceKey ? `${total} of ${goal} so far`
      : `skipped, ${total} of ${goal}`;
    tile.setAttribute('aria-label', `${longFmt.format(date)}: ${state}`);
    grid.appendChild(tile);
  }
  page.append(wds, grid);
  return page;
}

// Builds the calendar into root. Call show() once the panel is visible:
// it jumps to the current month and lets the tiles fill up.
export function renderCalendar(root, { totals, stats, onPick }) {
  const start = parseDay(CONFIG.startDate);
  const end = parseDay(CONFIG.endDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const months = [];
  for (let m = new Date(start.getFullYear(), start.getMonth(), 1); m <= end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    months.push(m);
  }
  const clamp = (i) => Math.min(months.length - 1, Math.max(0, i));
  const todayMonth = clamp(months.findIndex((m) => m.getFullYear() === today.getFullYear() && m.getMonth() === today.getMonth()));

  // Month header with arrows
  const nav = el('div', 'cal-nav');
  const prev = el('button', 'nav', '‹');
  const next = el('button', 'nav', '›');
  prev.type = next.type = 'button';
  prev.setAttribute('aria-label', 'Previous month');
  next.setAttribute('aria-label', 'Next month');
  const title = el('h3');
  nav.append(prev, title, next);

  // Swipeable months
  const strip = el('div', 'cal-months');
  const pages = months.map((m) => monthPage(m, { start, end, today, totals, stats }));
  strip.append(...pages);

  // Summary line and legend
  const foot = el('div', 'cal-foot');
  const summary = el('p', 'cal-summary');
  summary.append(
    stat(`${stats.completedDays}/${stats.dayIndex}`, 'days done'),
    stat(stats.totalPushups.toLocaleString(), 'push-ups'),
    stat(stats.bestStreak, 'best streak'),
  );
  const legend = el('div', 'cal-legend');
  legend.append(legendItem('done', 'Done'), legendItem('missed', 'Skipped'), legendItem('today', 'Today'));
  if (stats.graceKey) legend.appendChild(legendItem('pending', 'Can still log'));
  foot.append(summary, legend);

  root.replaceChildren(nav, strip, foot);

  let current = -1;
  const setMonth = (i) => {
    if (i === current) return;
    current = i;
    title.textContent = monthFmt.format(months[i]);
    prev.disabled = i === 0;
    next.disabled = i === months.length - 1;
  };
  const goTo = (i, smooth) => {
    strip.scrollTo({ left: pages[i].offsetLeft - pages[0].offsetLeft, behavior: smooth ? 'smooth' : 'instant' });
    setMonth(i);
  };
  let raf = 0;
  strip.onscroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      setMonth(clamp(Math.round(strip.scrollLeft / strip.getBoundingClientRect().width)));
    });
  };
  prev.onclick = () => goTo(clamp(current - 1), true);
  next.onclick = () => goTo(clamp(current + 1), true);
  strip.onclick = (e) => {
    const tile = e.target.closest('button.cal-tile');
    if (tile) onPick(tile.dataset.key);
  };
  setMonth(todayMonth);

  return {
    show() {
      goTo(todayMonth, false);
      // Fill the tiles in a quick ripple across the month (a frame later, so the
      // empty state is rendered first and the fill animates).
      requestAnimationFrame(() => {
        pages.forEach((page) => {
          page.querySelectorAll('button.cal-tile').forEach((tile, i) => {
            tile.style.setProperty('--delay', `${120 + i * 14}ms`);
            tile.style.setProperty('--p', tile.dataset.p);
          });
        });
      });
    },
  };
}
