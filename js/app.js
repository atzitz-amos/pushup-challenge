import { CONFIG, DEMO } from './config.js';
import { store } from './store.js';
import { computeStats, dayKey, parseDay, addDays, diffDays, totalsByDay } from './stats.js';
import { Wheel } from './wheel.js';
import { createRing } from './ring.js';
import * as fx from './effects.js';
import { registerPanel, openPanel, closePanel, sync as syncPanels, createSheet } from './nav.js';
import { renderCalendar } from './calendar.js';
import { onVerticalSwipe } from './gestures.js';

const $ = (s) => document.querySelector(s);
const { goal } = CONFIG;

const els = {
  hello: $('#hello'),
  date: $('#date'),
  streak: $('#streak'),
  streakStat: $('#streakStat'),
  lives: $('#lives'),
  livesIcon: $('#livesIcon'),
  livesStat: $('#livesStat'),
  pager: $('#pager'),
  dayTpl: $('#dayTpl'),
  loggerTpl: $('#loggerTpl'),
  todayBtn: $('#todayBtn'),
  toast: $('#toast'),
  toastText: $('#toastText'),
  undo: $('#undo'),
  onboard: $('#onboard'),
  onboardForm: $('#onboardForm'),
  nameInput: $('#nameInput'),
  demoNote: $('#demoNote'),
  menuBtn: $('#menuBtn'),
  avatar: $('#avatar'),
  menu: $('#menu'),
  menuAvatar: $('#menuAvatar'),
  menuName: $('#menuName'),
  menuSub: $('#menuSub'),
  soundToggle: $('#soundToggle'),
  soundIcon: $('#soundIcon'),
  demoReset: $('#demoReset'),
  calendarPanel: $('#panel-calendar'),
  calendarBody: $('#calendarBody'),
  app: $('.app'),
  pullHint: $('#pullHint'),
  pullText: $('#pullText'),
};

let user = null;
let stats = null;
let loadedDay = ''; // the day the pages were built for

let pages = [];
let todayIndex = 0;
let current = -1;
let today = null; // logger controller for today's page

const fmt = (opts) => new Intl.DateTimeFormat('en', opts);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }); // phone's own 12/24h style

/* ---------- Header ---------- */

function renderHeader() {
  const now = new Date();
  const christmas = addDays(parseDay(CONFIG.endDate), 1);
  const toGo = diffDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), christmas);
  els.hello.textContent = `Hi, ${user}`;
  els.date.textContent = toGo > 0 ? `${plural(toGo, 'day')} until Christmas 🎄` : 'Merry Christmas! 🎄';

  els.streak.textContent = stats.streak;
  els.streakStat.classList.toggle('hot', stats.streak > 0);
  els.streakStat.setAttribute('aria-label', `${stats.streak}-day streak`);

  const left = Math.max(0, stats.missesLeft);
  els.lives.textContent = left;
  els.livesIcon.textContent = left > 0 ? '💜' : '💔';
  els.livesStat.classList.toggle('danger', stats.missesLeft <= 0);
  els.livesStat.setAttribute('aria-label', `${plural(left, 'skip')} left`);

  const initial = [...user][0]?.toUpperCase() ?? '?';
  els.avatar.textContent = els.menuAvatar.textContent = initial;
  els.menuName.textContent = user;
  els.menuSub.textContent = `Day ${stats.dayIndex} of ${stats.totalDays} · ${stats.streak}-day streak`;
}

/* ---------- Day pages ---------- */

function pageTitle(d, rel, key) {
  if (rel === 0) return 'Today';
  if (rel === -1) return 'Yesterday';
  if (rel === 1) return 'Tomorrow';
  if (key === CONFIG.endDate) return 'Christmas Eve';
  return fmt({ weekday: 'long' }).format(d);
}

function pastSummary(dayTotal, sessions) {
  const wrap = document.createElement('div');
  wrap.className = 'summary';

  const status = document.createElement('div');
  const ok = dayTotal >= goal;
  status.className = `status ${ok ? 'ok' : 'miss'}`;
  status.textContent = ok
    ? '🔥 Completed'
    : dayTotal > 0 ? `💔 ${dayTotal} of ${goal} · skip used` : '💔 Skipped · skip used';

  const list = document.createElement('ul');
  list.className = 'sessions';
  for (const e of sessions) {
    const li = document.createElement('li');
    const count = document.createElement('b');
    count.textContent = `+${e.count}`;
    const at = document.createElement('span');
    at.textContent = timeFmt.format(e.ts);
    li.append(count, at);
    list.appendChild(li);
  }
  if (!sessions.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nothing logged this day';
    list.appendChild(li);
  }

  wrap.append(status, list);
  return wrap;
}

function lockedCard(rel, key) {
  const card = document.createElement('div');
  card.className = 'locked';
  const emoji = document.createElement('div');
  emoji.className = 'locked-emoji';
  emoji.textContent = key === CONFIG.endDate ? '🎄' : '🔒';
  const text = document.createElement('p');
  text.textContent = key === CONFIG.endDate
    ? `The final push · in ${plural(rel, 'day')}`
    : `Unlocks in ${plural(rel, 'day')}`;
  card.append(emoji, text);
  return card;
}

function buildPages(entries) {
  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = parseDay(CONFIG.startDate);
  const end = parseDay(CONFIG.endDate);
  const count = diffDays(start, end) + 1;

  const byDay = {};
  for (const e of entries) (byDay[e.date] ||= []).push(e);

  today = null;
  todayIndex = Math.min(count - 1, Math.max(0, diffDays(start, todayDate)));

  const built = [];
  for (let i = 0, d = start; i < count; i++, d = addDays(d, 1)) {
    const key = dayKey(d);
    const rel = diffDays(todayDate, d);
    const el = els.dayTpl.content.firstElementChild.cloneNode(true);
    const ringWrap = el.querySelector('.ring-wrap');
    const ring = createRing(ringWrap);
    const countEl = el.querySelector('.count');
    const body = el.querySelector('.page-body');
    const sessions = byDay[key] || [];
    const dayTotal = sessions.reduce((s, e) => s + e.count, 0);

    el.querySelector('.page-title').textContent = pageTitle(d, rel, key);
    el.querySelector('.page-sub').textContent = `${fmt({ month: 'long', day: 'numeric' }).format(d)} · Day ${i + 1}/${count}`;
    el.querySelector('.prev').disabled = i === 0;
    el.querySelector('.next').disabled = i === count - 1;
    el.querySelector('.of').textContent = `of ${goal}`;

    if (rel === 0) {
      el.classList.add('today');
      el.querySelector('.of').textContent = `of ${goal} today`;
      today = createLogger({ key, total: dayTotal, page: el, ring, count: countEl, body });
    } else if (rel < 0) {
      el.classList.add('past');
      el.classList.toggle('completed', dayTotal >= goal);
      ring.set(dayTotal / goal);
      countEl.textContent = dayTotal;
      body.appendChild(pastSummary(dayTotal, sessions));
    } else {
      el.classList.add('future');
      countEl.textContent = i + 1;
      el.querySelector('.of').textContent = 'day';
      body.appendChild(lockedCard(rel, key));
    }
    built.push(el);
  }

  els.pager.replaceChildren(...built);
  pages = built;
  if (today) renderLogger(today);
}

/* ---------- Logging today ---------- */

function createLogger(day) {
  const frag = els.loggerTpl.content.cloneNode(true);
  day.logger = frag.querySelector('.logger');
  day.done = frag.querySelector('.done');
  day.saveBtn = frag.querySelector('.save');
  day.saveLabel = frag.querySelector('.save-label');
  day.wheelEl = frag.querySelector('.wheel');
  day.center = day.page.querySelector('.ring-center');
  day.delta = day.page.querySelector('.ring-delta');
  day.selected = day.total;
  day.saving = false;
  day.body.append(frag);

  day.wheel = new Wheel(day.wheelEl, {
    onChange(v, { fromUser }) {
      updateSelection(day, v);
      if (fromUser) {
        fx.sound('tick', v);
        fx.haptic(6);
      }
    },
  });
  day.saveBtn.addEventListener('click', () => save(day));
  return day;
}

function renderLogger(day) {
  day.count.textContent = day.total;
  day.ring.set(day.total / goal);
  if (day.total >= goal) {
    setMode(day, 'done');
  } else {
    setMode(day, 'log');
    day.wheel.setRange(day.total, goal, day.total);
  }
}

function setMode(day, mode) {
  const done = mode === 'done';
  day.logger.hidden = done;
  day.done.hidden = !done;
  day.ring.complete(done);
  if (done) {
    day.done.querySelector('.done-text').textContent = stats.streak > 1
      ? `${stats.streak} days in a row. See you tomorrow!`
      : 'All 30 done. See you tomorrow!';
  }
}

function updateSelection(day, v) {
  day.selected = v;
  const delta = v - day.total;
  day.ring.preview(v / goal);
  day.delta.textContent = `+${delta}`;
  day.delta.classList.toggle('show', delta > 0);
  day.saveBtn.disabled = delta <= 0 || day.saving;
  day.saveLabel.textContent = delta > 0 ? `Save ${plural(delta, 'push-up')}` : 'Scroll to log';
}

async function save(day) {
  const delta = day.selected - day.total;
  if (day.saving || delta <= 0) return;

  // The app may have stayed open past midnight: start the new day instead.
  if (dayKey() !== loadedDay) {
    showToast('A new day started', false);
    load();
    return;
  }

  day.saving = true;
  day.saveBtn.disabled = true;
  fx.unlockAudio();
  fx.haptic(15);
  fx.sound('whoosh');

  await fx.flyParticles(day.saveBtn, day.center, Math.min(18, 6 + Math.round(delta / 2)));
  await store.addEntry(user, day.key, delta);

  const prev = day.total;
  day.total += delta;
  stats = computeStats(totalsByDay(await store.entries(user)));

  day.ring.set(day.total / goal);
  day.ring.pulse();
  fx.countUp(day.count, prev, day.total);
  fx.burstAt(day.center);
  fx.haptic(20);
  renderHeader();

  if (day.total >= goal) {
    fx.sound('complete');
    fx.celebrateConfetti();
    fx.bump(els.streakStat, 'flare');
    setMode(day, 'done');
  } else {
    fx.sound('save');
    day.wheel.setRange(day.total, goal, day.total);
    fx.bump(day.wheelEl, 'refresh');
  }

  showToast(`+${delta} saved`);
  day.saving = false;
  updateSelection(day, day.wheel.value ?? day.total);
}

async function undo() {
  hideToast();
  const removed = await store.removeLastEntry(user, dayKey());
  if (!removed) return;
  fx.haptic(10);
  const prev = today?.total;
  await load(current);
  if (today && prev != null) fx.countUp(today.count, prev, today.total, 500);
}

async function load(index) {
  const entries = await store.entries(user);
  stats = computeStats(totalsByDay(entries));
  loadedDay = dayKey();
  renderHeader();
  buildPages(entries);
  goTo(index ?? todayIndex, false);
  syncPanels(); // opens a panel named in the URL, e.g. #calendar
}

/* ---------- Pager ---------- */

// Page widths can be fractional, so measure exactly instead of using clientWidth.
const pageWidth = () => els.pager.getBoundingClientRect().width;

function goTo(index, smooth) {
  const left = pages[index]?.offsetLeft ?? 0;
  if (smooth) {
    els.pager.scrollTo({ left, behavior: 'smooth' });
  } else {
    current = index; // jumping programmatically: no haptic tick
    els.pager.scrollLeft = left;
    updatePager();
  }
}

// Neighbouring pages shrink and fade with their distance from the center.
let pagerRaf = 0;
function updatePager() {
  pagerRaf = 0;
  const w = pageWidth();
  if (!w || !pages.length) return;
  const pos = els.pager.scrollLeft / w;
  for (let i = Math.floor(pos) - 1; i <= Math.ceil(pos) + 1; i++) {
    const inner = pages[i]?.firstElementChild;
    if (!inner) continue;
    const a = Math.min(1, Math.abs(i - pos));
    inner.style.transform = a ? `scale(${1 - a * 0.1})` : '';
    inner.style.opacity = 1 - a * 0.65;
  }

  const index = Math.min(pages.length - 1, Math.max(0, Math.round(pos)));
  if (index !== current) {
    if (current !== -1) fx.haptic(4);
    current = index;
  }

  // "Back to today" pill: keep its arrow while it fades out, so it never flips mid-animation.
  const away = index !== todayIndex;
  if (away) els.todayBtn.textContent = index < todayIndex ? 'Today ›' : '‹ Today';
  els.todayBtn.classList.toggle('show', away);
  els.todayBtn.tabIndex = away ? 0 : -1;
}

/* ---------- Toast ---------- */

let toastTimer;
function showToast(text, withUndo = true) {
  els.toastText.textContent = text;
  els.undo.hidden = !withUndo;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}
function hideToast() {
  els.toast.classList.remove('show');
}

/* ---------- Menu and panels ---------- */

const menu = createSheet(els.menu);

function renderSoundToggle() {
  const muted = fx.isMuted();
  els.soundToggle.setAttribute('aria-checked', String(!muted));
  els.soundIcon.textContent = muted ? '🔇' : '🔊';
}

let calendar = null;
registerPanel('calendar', {
  el: els.calendarPanel,
  async render() {
    const totals = totalsByDay(await store.entries(user));
    calendar = renderCalendar(els.calendarBody, {
      totals,
      stats: computeStats(totals),
      onPick(key) {
        fx.haptic(8);
        goTo(diffDays(parseDay(CONFIG.startDate), parseDay(key)), false);
        closePanel();
      },
    });
  },
  onOpen() {
    calendar?.show();
  },
});

/* ---------- Swipe gestures for the calendar ---------- */

// Pull down on the main screen: a hint follows the finger; past the threshold,
// releasing opens the calendar. The wheel and lists keep their own scrolling.
const PULL_OPEN = 110;
let pullArmed = false;
onVerticalSwipe(els.app, {
  canStart: (e) => !!user && els.calendarPanel.hidden && els.menu.hidden
    && !e.target.closest('.wheel, .sessions'),
  onMove(dy) {
    const pull = Math.max(0, dy);
    const shift = Math.min(70, pull * 0.5);
    els.pullHint.classList.add('dragging');
    els.app.classList.add('pulling');
    els.pullHint.style.transform = `translate(-50%, ${shift - 60}px)`;
    els.pullHint.style.opacity = Math.min(1, pull / 60);
    els.pager.style.transform = `translateY(${Math.min(40, pull * 0.2)}px)`;
    const armed = pull >= PULL_OPEN;
    if (armed !== pullArmed) {
      pullArmed = armed;
      els.pullHint.classList.toggle('armed', armed);
      els.pullText.textContent = armed ? 'Release for calendar' : 'Pull for calendar';
      if (armed) fx.haptic(10);
    }
  },
  onEnd(cancelled) {
    els.pullHint.classList.remove('dragging', 'armed');
    els.app.classList.remove('pulling');
    els.pullHint.style.transform = els.pullHint.style.opacity = els.pager.style.transform = '';
    els.pullText.textContent = 'Pull for calendar';
    if (pullArmed && !cancelled) openPanel('calendar');
    pullArmed = false;
  },
});

// Swipe up on the open calendar to close it (horizontal swipes still change month).
onVerticalSwipe(els.calendarPanel, {
  canStart: () => !els.calendarPanel.hidden,
  onMove(dy) {
    els.calendarPanel.classList.add('dragging');
    els.calendarPanel.style.transform = `translateY(${Math.min(0, dy) * 0.6}px)`;
  },
  onEnd(cancelled) {
    const dy = parseFloat(els.calendarPanel.style.transform.replace(/[^-\d.]/g, '')) || 0;
    els.calendarPanel.classList.remove('dragging');
    els.calendarPanel.style.transform = '';
    if (!cancelled && dy < -60) {
      fx.haptic(8);
      closePanel();
    }
  },
});

/* ---------- Setup ---------- */

els.undo.addEventListener('click', undo);
els.menuBtn.addEventListener('click', () => {
  if (!user) return;
  fx.haptic(6);
  menu.open();
});
els.menu.addEventListener('click', (e) => {
  const item = e.target.closest('[data-panel]');
  if (!item) return;
  menu.close();
  openPanel(item.dataset.panel);
});
els.soundToggle.addEventListener('click', () => {
  fx.setMuted(!fx.isMuted());
  renderSoundToggle();
  fx.unlockAudio();
  fx.sound('tick', 15);
  fx.haptic(6);
});
els.pager.addEventListener('scroll', () => {
  if (!pagerRaf) pagerRaf = requestAnimationFrame(updatePager);
}, { passive: true });
els.pager.addEventListener('click', (e) => {
  const nav = e.target.closest('.nav');
  if (!nav || nav.disabled) return;
  goTo(current + (nav.classList.contains('next') ? 1 : -1), true);
});
els.todayBtn.addEventListener('click', () => {
  fx.haptic(8);
  goTo(todayIndex, true);
});
addEventListener('resize', () => goTo(current, false));

// Audio can only start after a user gesture; the first touch anywhere unlocks it.
document.addEventListener('pointerdown', fx.unlockAudio, { once: true });

// The app may stay open overnight: rebuild when a new day starts.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && user && dayKey() !== loadedDay) load();
});

els.onboardForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = els.nameInput.value.trim();
  if (!name) return;
  await store.setUser(name);
  user = name;
  els.onboard.classList.add('leaving');
  setTimeout(() => (els.onboard.hidden = true), 400);
  load();
});

function showOnboarding() {
  els.onboard.classList.remove('leaving');
  els.onboard.hidden = false;
}

if (DEMO) {
  els.demoReset.hidden = false;
  els.demoNote.hidden = false;
  els.demoReset.addEventListener('click', async () => {
    menu.close();
    await store.reset();
    user = null;
    hideToast();
    els.nameInput.value = '';
    showOnboarding();
  });
}

renderSoundToggle();
user = await store.getUser();
if (user) {
  load();
} else {
  showOnboarding();
}

if ('serviceWorker' in navigator && !DEMO) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
