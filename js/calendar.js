// Calendar panel: summary tiles, then one Monday-first month grid per challenge month.
// Each day is a small progress ring; tapping a day calls onPick(dayKey).
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

function tile(value, label) {
  const t = el('div', 'cal-tile');
  t.append(el('b', null, value), el('span', null, label));
  return t;
}

function legendItem(cls, label) {
  const item = el('span', 'cal-legend-item');
  item.append(el('i', `cal-day mini ${cls}`), label);
  return item;
}

// Returns the section of the current month, so the caller can scroll to it.
export function renderCalendar(root, { totals, stats, onPick }) {
  const { goal } = CONFIG;
  const start = parseDay(CONFIG.startDate);
  const end = parseDay(CONFIG.endDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let currentMonth = null;

  const summary = el('div', 'cal-summary');
  summary.append(
    tile(`${stats.completedDays}/${stats.dayIndex}`, 'days done'),
    tile(stats.totalPushups.toLocaleString(), 'push-ups'),
    tile(stats.bestStreak, 'best streak'),
    tile(Math.max(0, stats.missesLeft), stats.missesLeft === 1 ? 'skip left' : 'skips left'),
  );

  const months = [];
  for (let m = new Date(start.getFullYear(), start.getMonth(), 1); m <= end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const section = el('section', 'cal-month');
    section.appendChild(el('h3', null, monthFmt.format(m)));
    const grid = el('div', 'cal-grid');
    for (const w of WEEKDAYS) grid.appendChild(el('span', 'cal-wd', w));
    for (let i = (m.getDay() + 6) % 7; i > 0; i--) grid.appendChild(el('span'));

    const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    for (let n = 1; n <= daysInMonth; n++) {
      const date = new Date(m.getFullYear(), m.getMonth(), n);
      const key = dayKey(date);
      if (date < start || date > end) {
        grid.appendChild(el('span', 'cal-day out', n));
        continue;
      }
      const total = totals[key] || 0;
      const rel = diffDays(today, date);
      const cell = el('button', 'cal-day', n);
      cell.type = 'button';
      cell.dataset.key = key;
      cell.style.setProperty('--p', Math.min(1, total / goal));
      if (total >= goal) cell.classList.add('done');
      if (rel === 0) cell.classList.add('today');
      else if (rel > 0) cell.classList.add('future');
      else if (key === stats.graceKey) cell.classList.add('pending');
      else if (total < goal) cell.classList.add('missed');
      if (key === CONFIG.endDate) cell.classList.add('xmas');

      const state = rel > 0 ? 'upcoming'
        : total >= goal ? 'completed'
        : rel === 0 || key === stats.graceKey ? `${total} of ${goal} so far`
        : `skipped, ${total} of ${goal}`;
      cell.setAttribute('aria-label', `${longFmt.format(date)}: ${state}`);
      grid.appendChild(cell);
    }
    section.appendChild(grid);
    months.push(section);
    if (m.getFullYear() === today.getFullYear() && m.getMonth() === today.getMonth()) currentMonth = section;
  }

  const legend = el('div', 'cal-legend');
  legend.append(
    legendItem('done', 'Completed'),
    legendItem('missed', 'Skipped'),
    legendItem('today', 'Today'),
    legendItem('pending', 'Can still log'),
  );

  root.replaceChildren(summary, legend, ...months);
  root.onclick = (e) => {
    const cell = e.target.closest('button.cal-day');
    if (cell) onPick(cell.dataset.key);
  };
  return currentMonth;
}
