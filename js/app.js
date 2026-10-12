import { CONFIG, DEMO, applyRules, endsOnChristmasEve } from './config.js';
import { store, normalizeCode } from './store.js';
import { computeStats, dayKey, parseDay, addDays, diffDays, totalsByDay } from './stats.js';
import { Wheel } from './wheel.js';
import { createRing } from './ring.js';
import * as fx from './effects.js';
import { registerPanel, openPanel, closePanel, preparePanel, settlePanel, sync as syncPanels, createSheet } from './nav.js';
import { renderCalendar } from './calendar.js';
import { createTeamPage } from './team.js';
import { createSettingsPage } from './settings.js';
import { pushStatus, wantsPush, enablePush, registerPush, unregisterPush, disablePush } from './push.js';
import { onVerticalSwipe, onHorizontalSwipe } from './gestures.js';
import { t, getLang, setLang, dateFmt, capitalize, translatePage } from './i18n.js';
import { startTour } from './tour.js';
import { summary as cheerSummary, threadOf, createThread } from './cheers.js';

const $ = (s) => document.querySelector(s);
// The daily goal in effect (yours, or your team's); kept in step with CONFIG by useRules().
let goal = CONFIG.goal;
function useRules() {
  applyRules(store.rules);
  goal = CONFIG.goal;
}

const els = {
  hello: $('#hello'),
  date: $('#date'),
  streak: $('#streak'),
  streakStat: $('#streakStat'),
  lives: $('#lives'),
  livesIcon: $('#livesIcon'),
  livesStat: $('#livesStat'),
  pager: $('#pager'),
  strip: $('#strip'),
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
  tourBtn: $('#tourBtn'),
  thread: $('#thread'),
  topStats: $('.top-stats'),
  calendarPanel: $('#panel-calendar'),
  calendarBody: $('#calendarBody'),
  teamPanel: $('#panel-team'),
  teamBody: $('#teamBody'),
  teamMenuSub: $('#teamMenuSub'),
  settingsPanel: $('#panel-settings'),
  settingsBody: $('#settingsBody'),
  onboardTitle: $('#onboardTitle'),
  onboardRules: $('#onboardRules'),
  onboardLangs: $('#onboardLangs'),
  app: $('.app'),
};

let user = null;
let stats = null;
let loadedDay = ''; // the day the pages were built for

let pages = [];
let todayIndex = 0;
let current = -1;
let today = null; // logger controller for today's page

// Times follow the app's language (21:10 in French, 9:10 PM in English).
const timeFmt = { format: (t) => dateFmt({ hour: 'numeric', minute: '2-digit' }).format(t) };

/* ---------- Header ---------- */

function renderHeader() {
  const now = new Date();
  const finish = addDays(parseDay(CONFIG.endDate), endsOnChristmasEve() ? 1 : 0);
  const toGo = diffDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), finish);
  els.hello.textContent = t('head.hello', { name: user });
  els.date.textContent = endsOnChristmasEve()
    ? (toGo > 0 ? t('head.untilChristmas', { n: toGo }) : t('head.christmas'))
    : (toGo > 0 ? t('head.toGo', { n: toGo }) : toGo === 0 ? t('head.lastDay') : t('head.finished'));

  els.streak.textContent = stats.streak;
  els.streakStat.classList.toggle('hot', stats.streak > 0);
  els.streakStat.setAttribute('aria-label', t('head.streakLabel', { n: stats.streak }));

  const left = Math.max(0, stats.missesLeft);
  els.lives.textContent = left;
  els.livesIcon.textContent = left > 0 ? '💜' : '💔';
  els.livesStat.classList.toggle('danger', stats.missesLeft <= 0);
  els.livesStat.setAttribute('aria-label', t('head.skipsLabel', { n: left }));

  const initial = [...user][0]?.toUpperCase() ?? '?';
  els.avatar.textContent = els.menuAvatar.textContent = initial;
  els.menuName.textContent = user;
  els.menuSub.textContent = t('menu.sub', { day: stats.dayIndex, total: stats.totalDays, streak: stats.streak });
  renderUnread();
}

/* ---------- Day pages ---------- */

function pageTitle(d, rel, key) {
  if (rel === 0) return t('day.today');
  if (rel === -1) return t('day.yesterday');
  if (rel === 1) return t('day.tomorrow');
  if (key === CONFIG.endDate) return endsOnChristmasEve() ? t('day.christmasEve') : t('day.final');
  return capitalize(dateFmt({ weekday: 'long' }).format(d));
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// A past day as an achievement card: headline, a bar showing how the day's
// sets added up toward the goal, and a few stats.
function pastSummary(dayTotal, sessions, streakLen) {
  const ok = dayTotal >= goal;
  const card = el('div', `summary ${ok ? 'ok' : 'miss'}`);

  // Headline
  let finishedAt = null;
  for (let sum = 0, i = 0; i < sessions.length && !finishedAt; i++) {
    sum += sessions[i].count;
    if (sum >= goal) finishedAt = sessions[i].ts;
  }
  const head = el('div', 'achv');
  const text = el('div');
  if (ok) {
    head.appendChild(el('span', 'achv-emoji', '🔥'));
    text.append(el('h3', null, t('day.complete')), el('p', null, t('day.finishedAt', { time: timeFmt.format(finishedAt) })));
  } else if (dayTotal > 0) {
    head.appendChild(el('span', 'achv-emoji', '💔'));
    text.append(el('h3', null, t('day.skipUsed')), el('p', null, t('day.partial', { done: dayTotal, goal })));
  } else {
    head.appendChild(el('span', 'achv-emoji', '💤'));
    text.append(el('h3', null, t('day.rest')), el('p', null, t('day.nothing')));
  }
  head.appendChild(text);
  card.appendChild(head);
  if (!sessions.length) return card;

  // Sets stacked toward the goal
  const bar = el('div', 'sets-bar');
  const scale = Math.max(goal, dayTotal);
  sessions.forEach((s, i) => {
    const seg = el('span', 'set', s.count);
    seg.style.flexBasis = `${(s.count / scale) * 100}%`;
    seg.style.setProperty('--i', i % 3);
    if (s.count / scale < 0.1) seg.classList.add('narrow'); // too thin for its number
    bar.appendChild(seg);
  });
  card.appendChild(bar);

  // Stats
  const stats = el('div', 'achv-stats');
  const stat = (value, label) => {
    const s = el('div');
    s.append(el('b', null, value), el('span', null, label));
    stats.appendChild(s);
  };
  stat(sessions.length, t('day.sets', { n: sessions.length }));
  stat(Math.max(...sessions.map((s) => s.count)), t('day.bestSet'));
  if (ok) stat(streakLen, t('day.inARow', { n: streakLen }));
  else stat(goal - dayTotal, t('day.short'));
  card.appendChild(stats);
  return card;
}

function lockedCard(rel, key) {
  const card = document.createElement('div');
  card.className = 'locked';
  const emoji = document.createElement('div');
  emoji.className = 'locked-emoji';
  emoji.textContent = key === CONFIG.endDate ? (endsOnChristmasEve() ? '🎄' : '🏁') : '🔒';
  const text = document.createElement('p');
  text.textContent = key === CONFIG.endDate ? t('day.finalPush', { n: rel }) : t('day.unlocks', { n: rel });
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
  let run = 0; // completed days in a row up to the current day
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
    run = dayTotal >= goal ? run + 1 : 0;

    el.querySelector('.page-title').textContent = pageTitle(d, rel, key);
    el.querySelector('.page-sub').textContent = t('day.sub', { date: dateFmt({ month: 'long', day: 'numeric' }).format(d), i: i + 1, count });
    el.querySelector('.prev').disabled = i === 0;
    el.querySelector('.next').disabled = i === count - 1;
    el.querySelector('.of').textContent = t('day.of', { goal });

    if (rel === 0) {
      el.classList.add('today');
      el.querySelector('.of').textContent = t('day.ofToday', { goal });
      today = createLogger({ key, total: dayTotal, page: el, ring, count: countEl, body });
      today.done.querySelector('.done-card').appendChild(cheersSlot(key));
    } else if (rel < 0) {
      el.classList.add('past');
      el.classList.toggle('completed', dayTotal >= goal);
      ring.set(dayTotal / goal);
      countEl.textContent = dayTotal;
      const card = pastSummary(dayTotal, sessions, run);
      card.appendChild(cheersSlot(key));
      body.appendChild(card);
    } else {
      el.classList.add('future');
      countEl.textContent = i + 1;
      el.querySelector('.of').textContent = t('day.future');
      body.appendChild(lockedCard(rel, key));
    }
    built.push(el);
  }

  els.strip.replaceChildren(...built);
  pages = built;
  renderDayCheers();
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
      ? t('log.doneStreak', { n: stats.streak })
      : t('log.doneAll', { goal });
  }
}

function updateSelection(day, v) {
  day.selected = v;
  const delta = v - day.total;
  day.ring.preview(v / goal);
  day.delta.textContent = `+${delta}`;
  day.delta.classList.toggle('show', delta > 0);
  day.saveBtn.disabled = delta <= 0 || day.saving;
  day.saveLabel.textContent = delta > 0 ? t('log.save', { n: delta }) : t('log.scroll');
}

async function save(day) {
  const delta = day.selected - day.total;
  if (day.saving || delta <= 0) return;

  // The app may have stayed open past midnight: start the new day instead.
  if (dayKey() !== loadedDay) {
    showToast(t('log.newDay'), false);
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

  showToast(t('log.saved', { n: delta }));
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
  useRules();
  const entries = await store.entries(user);
  stats = computeStats(totalsByDay(entries));
  loadedDay = dayKey();
  renderHeader();
  buildPages(entries);
  goTo(index ?? todayIndex, false);
  syncPanels(); // opens a panel named in the URL, e.g. #calendar
}

/* ---------- Pager ---------- */

// The days sit side by side in a strip that is moved with a transform. Swipes are
// handled here rather than by native scrolling, so one swipe always moves exactly
// one day (native momentum could fling past a day). pos is the position in days,
// fractional while moving.
let pos = 0;
let animFrame = 0;
let animTimer = 0;

// The layout width: exact (it can be fractional, unlike clientWidth) and not affected
// by the main screen shrinking behind an open panel (getBoundingClientRect is, which
// made picking a day in the calendar land between two days).
const pageWidth = () => parseFloat(getComputedStyle(els.pager).width);
const clampIndex = (i) => Math.min(pages.length - 1, Math.max(0, i));
const easeOut = (t) => 1 - Math.pow(1 - t, 4);

function stopAnimation() {
  cancelAnimationFrame(animFrame);
  clearTimeout(animTimer);
}

function animateTo(target, duration) {
  stopAnimation();
  const from = pos;
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / duration);
    pos = from + (target - from) * easeOut(k);
    updatePager();
    if (k < 1) animFrame = requestAnimationFrame(step);
  };
  animFrame = requestAnimationFrame(step);
  // Browsers pause animation frames in the background; never leave a day half-shown.
  animTimer = setTimeout(() => {
    stopAnimation();
    pos = target;
    updatePager();
  }, duration + 60);
}

function goTo(index, smooth) {
  index = clampIndex(index);
  if (smooth) {
    // Longer jumps (e.g. back to today from far away) get a little more time.
    animateTo(index, Math.min(650, 320 + 30 * Math.abs(index - pos)));
  } else {
    stopAnimation();
    current = index; // jumping programmatically: no haptic tick
    pos = index;
    updatePager();
  }
}

// Moves the strip; neighbouring pages shrink and fade with their distance from the center.
function updatePager() {
  const w = pageWidth();
  if (!w || !pages.length) return;
  els.strip.style.transform = `translate3d(${-pos * w}px, 0, 0)`;
  for (let i = Math.floor(pos) - 1; i <= Math.ceil(pos) + 1; i++) {
    const inner = pages[i]?.firstElementChild;
    if (!inner) continue;
    const a = Math.min(1, Math.abs(i - pos));
    inner.style.transform = a ? `scale(${1 - a * 0.1})` : '';
    inner.style.opacity = 1 - a * 0.65;
  }

  const index = clampIndex(Math.round(pos));
  if (index !== current) {
    if (current !== -1) fx.haptic(4);
    current = index;
  }

  // "Back to today" pill: keep its arrow while it fades out, so it never flips mid-animation.
  const away = index !== todayIndex;
  if (away) els.todayBtn.classList.toggle('left', index > todayIndex); // today lies to the left
  els.todayBtn.classList.toggle('show', away);
  els.todayBtn.tabIndex = away ? 0 : -1;
}

// Swipe left/right: the strip follows the finger, then settles on the next or
// previous day (never further) when the swipe went a fifth of the way or was a flick.
let swipeBase = 0;
onHorizontalSwipe(els.pager, {
  canStart: () => pages.length > 0,
  onStart() {
    stopAnimation();
    swipeBase = pos;
  },
  onMove(dx) {
    let p = swipeBase - dx / pageWidth();
    // Rubber band past the first and last day.
    if (p < 0) p *= 0.3;
    else if (p > pages.length - 1) p = pages.length - 1 + (p - (pages.length - 1)) * 0.3;
    pos = p;
    updatePager();
  },
  onEnd(cancelled, { dx, vx }) {
    const from = Math.round(swipeBase);
    let target = from;
    if (!cancelled) {
      if (dx < -pageWidth() * 0.2 || vx < -0.35) target = from + 1;
      else if (dx > pageWidth() * 0.2 || vx > 0.35) target = from - 1;
    }
    animateTo(clampIndex(target), 300);
  },
});

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
/* ---------- Sharing: sync with Supabase and the team page ---------- */

let syncOk = true;
let pushRegistered = false;
const pushOfferDismissed = () => { try { return localStorage.getItem('pushups.notifyOffer') === 'dismissed'; } catch { return false; } };
const ownSignature = (list) => list.map((e) => `${e.id}:${e.count}`).join('|');

function teamStatus() {
  if (DEMO) return store.team?.code === 'DEMO42' ? t('team.demoMates') : t('team.demoAlone');
  if (!syncOk) return t('team.offline');
  if (!store.lastSync) return t('team.loading');
  return t('team.updated', { time: timeFmt.format(store.lastSync) });
}

// A shared invite link (…?team=CODE) opens the team page with the code filled in.
let inviteCode = normalizeCode(new URLSearchParams(location.search).get('team')).slice(0, 6) || null;
function openInvite() {
  if (!inviteCode || !user) return;
  // Drop the code from the address so a reload doesn't reopen it (other parameters stay).
  const params = new URLSearchParams(location.search);
  params.delete('team');
  const query = params.toString();
  history.replaceState(null, '', location.pathname + (query ? `?${query}` : '') + location.hash);
  openPanel('team');
}

const teamPage = createTeamPage(els.teamBody, {
  getData: () => ({
    team: store.team,
    entries: store.teamEntries(),
    members: store.teamMembers(),
    me: user,
    status: teamStatus(),
    available: store.hasTeams,
    inviteCode,
    pushOffer: pushStatus().supported && !wantsPush() && !pushOfferDismissed(),
    cheersOn: store.cheersOn,
    cheers: store.cheers(),
  }),
  actions: {
    lookup: (code) => store.lookupTeam(code),
    create: (name) => store.createTeam(name),
    async enablePush() {
      try {
        await enablePush(store.team, user);
        showToast(t('toast.notifOn'), false);
      } catch (err) {
        if (err.code !== 'denied') throw err;
        showToast(t('toast.notifDenied'), false);
      }
    },
    dismissPush() {
      try { localStorage.setItem('pushups.notifyOffer', 'dismissed'); } catch { /* ignore */ }
    },
    react(owner, day, emoji) {
      const added = store.toggleReaction(owner, day, emoji);
      renderDayCheers();
      return added;
    },
    openThread: (owner, day) => thread.open(owner, day),
    async join(team) {
      await store.joinTeam(team); // uploads your history to the team, then syncs
      registerPush(store.team, user).catch((err) => console.warn('Notifications not registered:', err));
      inviteCode = null;
      syncOk = true;
      fx.haptic(15);
      await load(current);
    },
    async leave() {
      await unregisterPush();
      await store.leaveTeam();
      await load(current);
    },
  },
});

function renderTeamPanel() {
  teamPage.render();
}

// Pulls everyone's latest entries. Today's page is only rebuilt when your own
// entries changed (e.g. you logged on another device), so the wheel isn't reset for nothing.
let refreshing = null;
function refreshFromServer() {
  if (!store.isRemote || !user) return Promise.resolve();
  refreshing ||= (async () => {
    const before = ownSignature(await store.entries(user));
    const res = await store.sync();
    syncOk = res.ok;
    const ownChanged = ownSignature(await store.entries(user)) !== before;
    if (res.ok && (ownChanged || res.rulesChanged) && !today?.saving) await load(current);
    if (res.teamGone) showToast(t('toast.teamGone', { team: res.teamGone }), false);
    // Teammates' fresh saves while the app is open.
    if (res.news?.length && document.visibilityState === 'visible') {
      const byPerson = [];
      for (const n of res.news) {
        const p = byPerson.find((x) => x.user === n.user);
        if (p) p.count += n.count; else byPerson.push({ user: n.user, count: n.count });
      }
      showToast(byPerson.map((p) => `${p.user} +${p.count}`).join(' · ') + ' 💪', false);
      fx.haptic(8);
    }
    if (res.ok && !pushRegistered) {
      pushRegistered = true; // once per visit: refreshes this phone's subscription on the server
      registerPush(store.team, user).catch((err) => console.warn('Notifications not registered:', err));
    }
    if (res.cheers) cheersSynced(res.cheers);
    if (els.teamPanel.classList.contains('open')) renderTeamPanel();
    if (res.rulesChanged && els.settingsPanel.classList.contains('open')) {
      settingsPage.reset(); // someone in the team changed the rules: show the new ones
      settingsPage.render();
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/* ---------- Cheers: reactions and comments on each other's days ---------- */

// A spot on your day cards for the cheers you got (filled by renderDayCheers).
function cheersSlot(key) {
  const slot = el('div', 'day-cheers-slot');
  slot.dataset.day = key;
  return slot;
}

function renderDayCheers() {
  const cheers = store.cheers();
  for (const slot of els.strip.querySelectorAll('.day-cheers-slot')) {
    const day = slot.dataset.day;
    const row = store.cheersOn ? cheerSummary(threadOf(cheers, user, day), () => thread.open(user, day)) : null;
    slot.replaceChildren(...(row ? [row] : []));
  }
}

// The dot on the menu button, and the count in the menu, for cheers you haven't seen.
function renderUnread() {
  const n = store.cheersOn ? store.unreadCheers() : 0;
  els.menuBtn.classList.toggle('unread', n > 0);
  els.teamMenuSub.textContent = n ? t('cheer.unread', { n }) : store.team ? store.team.name : t('menu.teamSub');
}

// Something changed in the cheers: update every place that shows them.
function cheersChanged() {
  renderDayCheers();
  renderUnread();
  if (thread.isOpen) thread.render();
  if (els.teamPanel.classList.contains('open')) renderTeamPanel();
}

// After a sync: refresh what shows cheers, and tell about new ones for you.
function cheersSynced(res) {
  if (res.changed) cheersChanged();
  const news = res.news.filter((c) => !(thread.isOpen && thread.isShowing(c.owner, c.day)));
  if (!news.length || document.visibilityState !== 'visible') return;
  const c = news.at(-1);
  const text = news.length > 1 ? t('cheer.toastMany', { n: news.length })
    : c.body ? `${c.author}: ${c.body}` : t('cheer.toastReact', { name: c.author, emoji: c.emoji });
  showToast(text, false);
  fx.haptic(8);
}

const thread = createThread(els.thread, createSheet(els.thread), {
  getData: () => ({ cheers: store.cheers(), entries: store.teamEntries(), me: user }),
  actions: {
    react(owner, day, emoji) {
      if (store.toggleReaction(owner, day, emoji)) fx.haptic(10);
      cheersChanged();
    },
    comment(owner, day, text) {
      store.addComment(owner, day, text);
      fx.haptic(8);
      cheersChanged();
    },
    remove(id) {
      store.removeCheer(id);
      fx.haptic(12);
      cheersChanged();
    },
    // While a thread is open it refreshes every few seconds, so a conversation flows.
    opened() {
      store.markCheersSeen();
      renderUnread();
      clearInterval(threadTimer);
      threadTimer = setInterval(() => {
        if (document.visibilityState === 'visible') store.syncCheers().then(cheersSynced);
      }, 5000);
    },
    closed() {
      clearInterval(threadTimer);
      cheersChanged();
    },
  },
});
let threadTimer = 0;

registerPanel('team', {
  el: els.teamPanel,
  render: renderTeamPanel,
  onOpen() {
    els.app.classList.add('behind');
    if (store.cheersOn) {
      store.markCheersSeen();
      renderUnread();
    }
    refreshFromServer();
  },
  onClose() {
    els.app.classList.remove('behind');
    teamPage.reset();
  },
});

const settingsPage = createSettingsPage(els.settingsBody, {
  getContext: () => ({
    rules: store.rules,
    teamName: store.rulesAreShared ? store.team.name : null,
    push: { ...pushStatus(), enabled: wantsPush() && pushStatus().supported && Notification.permission === 'granted' },
    lang: getLang(),
  }),
  // Switches the language right away: static texts, the day pages, and the open settings.
  async setLanguage(lang) {
    setLang(lang);
    renderStaticTexts();
    if (user) await load(current);
    settingsPage.render();
    // Notifications come in the phone's language: tell the server.
    registerPush(store.team, user).catch((err) => console.warn('Notifications not updated:', err));
  },
  async resetProgress() {
    await store.resetProgress();
    fx.haptic(15);
    await load(current);
    showToast(t('toast.progressReset'), false);
  },
  async startOver() {
    await disablePush();
    await store.startOver();
    setTourSeen(false);
    user = null;
    closePanel();
    hideToast();
    els.nameInput.value = '';
    showOnboarding();
  },
  async togglePush(on) {
    if (on) {
      await enablePush(store.team, user);
      showToast(t('toast.notifOn'), false);
    } else {
      await disablePush();
      showToast(t('toast.notifOff'), false);
    }
  },
  async save(rules) {
    await store.saveRules(rules);
    fx.haptic(12);
    await load(current);
    showToast(store.rulesAreShared ? t('toast.rulesTeam') : t('toast.rules'), false);
  },
});

registerPanel('settings', {
  el: els.settingsPanel,
  render: () => settingsPage.render(),
  onOpen() {
    els.app.classList.add('behind');
  },
  onClose() {
    els.app.classList.remove('behind');
    settingsPage.reset();
  },
});

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
    els.app.classList.add('behind');
  },
  onClose() {
    els.app.classList.remove('behind');
  },
});

/* ---------- Swipe gestures for the calendar ---------- */

// Like switching apps on an iPhone: the calendar card follows the finger 1:1
// while the main screen shrinks and dims behind it (--p: 0 = main, 1 = calendar).
// On release, distance or a quick flick decides whether it opens or springs back.
const screenH = () => window.innerHeight;
const flung = (dist, v) => dist > screenH() * 0.22 || v > 0.5;

function dragTo(panelY, progress) {
  document.body.classList.add('panel-drag');
  els.calendarPanel.style.transform = `translateY(${panelY}px)`;
  els.app.style.setProperty('--p', Math.min(1, Math.max(0, progress)));
}

function endDrag() {
  // Let the CSS transitions carry both layers from here to their resting state.
  document.body.classList.remove('panel-drag');
  els.calendarPanel.style.transform = '';
  els.app.style.removeProperty('--p');
}

// Swipe up on the main screen (the wheel and lists keep their own scrolling).
let opening = false;
onVerticalSwipe(els.app, {
  canStart: (e) => !!user && els.calendarPanel.hidden && els.menu.hidden
    && !e.target.closest('.wheel, .sessions'),
  onMove(dy) {
    if (!opening) {
      opening = true;
      preparePanel('calendar').then(() => calendar?.show());
    }
    const pull = Math.max(0, -dy);
    dragTo(Math.max(0, screenH() - pull), pull / screenH());
  },
  onEnd(cancelled, { dy, vy }) {
    if (!opening) return;
    opening = false;
    endDrag();
    if (!cancelled && flung(-dy, -vy)) {
      fx.haptic(8);
      openPanel('calendar');
    } else {
      settlePanel('calendar');
    }
  },
});

// Swipe down on the open calendar to close it (horizontal swipes still change month).
onVerticalSwipe(els.calendarPanel, {
  canStart: () => els.calendarPanel.classList.contains('open') && els.calendarBody.scrollTop <= 0,
  onMove(dy) {
    const pull = Math.max(0, dy);
    dragTo(pull, 1 - pull / screenH());
  },
  onEnd(cancelled, { dy, vy }) {
    endDrag();
    if (!cancelled && flung(dy, vy)) {
      fx.haptic(8);
      closePanel();
    }
  },
});

/* ---------- Guided tour ---------- */

// Shown once after picking a name (and to anyone who hasn't seen it yet);
// "How it works" in the menu replays it.
const TOUR_KEY = DEMO ? 'pushups.demo.tour' : 'pushups.tour';
const tourSeen = () => { try { return !!localStorage.getItem(TOUR_KEY); } catch { return true; } };
function setTourSeen(seen) {
  try {
    if (seen) localStorage.setItem(TOUR_KEY, '1');
    else localStorage.removeItem(TOUR_KEY);
  } catch { /* ignore */ }
}

function showTour() {
  if (!user || !today) return; // no today's page before or after the challenge
  hideToast();
  goTo(todayIndex, false);
  const done = today.total >= goal;
  startTour([
    {
      emoji: '💪',
      target: () => today.page.querySelector('.ring-wrap'),
      shape: 'round',
      pad: 0,
      title: t('tour.ring.title'),
      text: t('tour.ring.text', { goal }),
    },
    {
      emoji: '🎡',
      target: () => (done ? today.done : today.logger),
      title: t('tour.log.title'),
      text: t(done ? 'tour.log.doneText' : 'tour.log.text'),
    },
    {
      emoji: '🔥',
      target: () => els.topStats,
      radius: 20,
      title: t('tour.stats.title'),
      text: t('tour.stats.text', { n: CONFIG.allowedMisses }),
    },
    {
      emoji: '👈',
      target: () => today.page.querySelector('.page-head'),
      gesture: 'swipe-x',
      title: t('tour.days.title'),
      text: t('tour.days.text'),
    },
    {
      emoji: '📅',
      target: null,
      gesture: 'swipe-up',
      title: t('tour.calendar.title'),
      text: t('tour.calendar.text'),
    },
    {
      emoji: '👥',
      target: () => els.menuBtn,
      shape: 'round',
      pad: 8,
      title: t('tour.menu.title'),
      text: t('tour.menu.text'),
    },
  ], {
    onEnd() {
      setTourSeen(true);
      fx.haptic(8);
    },
  });
}

// After a name was just picked or on start: the tour first, unless an invite link opens the team page.
function maybeShowTour() {
  if (inviteCode || tourSeen()) return;
  setTimeout(showTour, 450);
}

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
els.tourBtn.addEventListener('click', () => {
  menu.close();
  setTimeout(showTour, 380); // once the menu is out of the way
});
els.soundToggle.addEventListener('click', () => {
  fx.setMuted(!fx.isMuted());
  renderSoundToggle();
  fx.unlockAudio();
  fx.sound('tick', 15);
  fx.haptic(6);
});
els.pager.addEventListener('click', (e) => {
  const nav = e.target.closest('.nav');
  if (!nav || nav.disabled) return;
  goTo(current + (nav.classList.contains('next') ? 1 : -1), true);
});
els.todayBtn.addEventListener('click', () => {
  fx.haptic(8);
  goTo(todayIndex, true);
});
// Re-align only when the width changes: Android's address bar showing or hiding
// only changes the height, and re-aligning mid-swipe used to skip a day.
let lastWidth = innerWidth;
addEventListener('resize', () => {
  if (innerWidth === lastWidth) return;
  lastWidth = innerWidth;
  updatePager();
});

// Audio can only start after a user gesture; the first touch anywhere unlocks it.
document.addEventListener('pointerdown', fx.unlockAudio, { once: true });

// The app may stay open overnight: rebuild when a new day starts.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !user) return;
  if (dayKey() !== loadedDay) load();
  refreshFromServer();
});
// Stay fresh while open, and catch up as soon as the connection comes back.
setInterval(() => {
  if (document.visibilityState === 'visible') refreshFromServer();
}, 60000);
addEventListener('online', () => refreshFromServer());

els.onboardForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = els.nameInput.value.trim();
  if (!name) return;
  await store.setUser(name);
  user = name;
  els.onboard.classList.add('leaving');
  setTimeout(() => (els.onboard.hidden = true), 400);
  await load();
  refreshFromServer();
  maybeShowTour();
  openInvite();
});

// Texts outside the rebuilt screens: the page's static texts and the name screen.
function renderStaticTexts() {
  translatePage();
  els.onboardTitle.textContent = t('onboard.title', { goal: CONFIG.goal });
  els.onboardRules.textContent = t('onboard.rules', {
    goal: CONFIG.goal,
    n: CONFIG.allowedMisses,
    christmas: endsOnChristmasEve(),
    end: dateFmt({ month: 'long', day: 'numeric' }).format(parseDay(CONFIG.endDate)),
  });
}

function showOnboarding() {
  els.onboard.classList.remove('leaving');
  els.onboard.hidden = false;
  renderOnboardLangs();
}

// Language picker on the name screen, so everything after it (the tour included)
// is in the right language from the start.
function renderOnboardLangs() {
  for (const b of els.onboardLangs.querySelectorAll('[data-lang]')) {
    const on = b.dataset.lang === getLang();
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
}
els.onboardLangs.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b || b.dataset.lang === getLang()) return;
  setLang(b.dataset.lang);
  renderStaticTexts();
  renderOnboardLangs();
  fx.haptic(6);
  // A little fade so the switch is noticeable.
  for (const node of [els.onboardTitle, els.onboardRules]) {
    node.classList.remove('lang-swap');
    void node.offsetWidth;
    node.classList.add('lang-swap');
  }
});

if (DEMO) {
  els.demoReset.hidden = false;
  els.demoNote.hidden = false;
  els.demoReset.addEventListener('click', async () => {
    menu.close();
    await store.reset();
    setTourSeen(false);
    user = null;
    hideToast();
    els.nameInput.value = '';
    showOnboarding();
  });
}

renderSoundToggle();
useRules();
renderStaticTexts();
user = await store.getUser();
if (user) {
  await load(); // instantly, from what is saved on this phone
  refreshFromServer();
  maybeShowTour();
  openInvite();
} else {
  showOnboarding();
}

// Started fine: no rescue reload needed (index.html registers the service worker).
window.__booted = true;
try { sessionStorage.removeItem('pushups.reloaded'); } catch { /* ignore */ }
