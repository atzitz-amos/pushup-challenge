// Team page. Without a team it offers to create one or join one with a code.
// In a team it is a scoreboard: today's team score with a relay bar, a podium
// for the longest streaks, and a leaderboard with badges (tap a row for details).
import { CONFIG } from './config.js';
import { computeStats, totalsByDay, dayKey, addDays, parseDay } from './stats.js';
import { sameName, normalizeCode } from './store.js';
import * as fx from './effects.js';
import { t, dateFmt, num } from './i18n.js';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function button(cls, text, onClick) {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

const initial = (name) => [...name][0]?.toUpperCase() ?? '?';

/* ---------- People and ranking ---------- */

// When today's total reached the goal (timestamp), or null.
function finishedAt(entries) {
  const today = dayKey();
  let sum = 0;
  for (const e of entries.filter((x) => x.date === today).sort((a, b) => a.ts - b.ts)) {
    sum += e.count;
    if (sum >= CONFIG.goal) return e.ts;
  }
  return null;
}

// Everyone in the team (members with no entries yet too), ranked by streak,
// then completed days, then today's total.
function rankPeople(entries, me, members) {
  const groups = members.map((name) => ({ name, entries: [] }));
  for (const e of entries) {
    const g = groups.find((x) => sameName(x.name, e.user));
    if (g) g.entries.push(e); // entries of people who left the team are not shown
  }
  if (me && !groups.some((g) => sameName(g.name, me))) groups.push({ name: me, entries: [] });
  const list = groups.map((g) => {
    const totals = totalsByDay(g.entries);
    return { name: g.name, totals, stats: computeStats(totals), done: finishedAt(g.entries), isMe: sameName(g.name, me) };
  });
  list.sort((a, b) => b.stats.streak - a.stats.streak
    || b.stats.completedDays - a.stats.completedDays
    || b.stats.todayTotal - a.stats.todayTotal
    || a.name.localeCompare(b.name));
  list.forEach((p, i) => (p.rank = i + 1));
  return list;
}

function badges(p) {
  const out = [];
  if (p.done) out.push(['done', t('badge.done')]);
  if (p.done && new Date(p.done).getHours() < 9) out.push(['early', t('badge.early')]);
  if (p.stats.streak >= 7) out.push(['fire', t('badge.fire')]);
  if (p.stats.missesLeft === CONFIG.allowedMisses && p.stats.dayIndex > 1) out.push(['clean', t('badge.clean')]);
  return out.slice(0, 2);
}

/* ---------- Scoreboard pieces ---------- */

// Number that counts up from 0 when the page opens.
function countNum(value, cls = 'num') {
  const n = el('b', cls, num(value));
  n.dataset.count = value;
  return n;
}

function avatar(p, size = '') {
  const a = el('div', `ava ${size}`, initial(p.name));
  a.style.setProperty('--p', Math.min(1, p.stats.todayTotal / CONFIG.goal));
  return a;
}

function hero(list) {
  const { goal } = CONFIG;
  const done = list.filter((p) => p.done).length;
  const pushups = list.reduce((s, p) => s + p.stats.todayTotal, 0);
  const allTime = list.reduce((s, p) => s + p.stats.totalPushups, 0);

  const card = el('section', `th-hero${done === list.length ? ' all-done' : ''}`);
  card.appendChild(el('span', 'th-label', t('team.today')));

  const score = el('div', 'th-score');
  score.append(countNum(done), el('span', 'th-of', `/${list.length}`));
  const side = el('div', 'th-side');
  side.append(el('span', null, t('team.doneToday')));
  const today = el('span', 'th-today');
  today.append(countNum(pushups, 'num small'), t('team.pushups'));
  side.appendChild(today);
  score.appendChild(side);
  card.appendChild(score);

  // Relay bar: one segment per person, filling with their progress.
  const relay = el('div', 'th-relay');
  for (const p of list) {
    const seg = el('div', `seg${p.done ? ' full' : ''}`);
    seg.style.setProperty('--p', Math.min(1, p.stats.todayTotal / goal));
    seg.appendChild(el('span', null, initial(p.name)));
    seg.title = `${p.name}: ${p.stats.todayTotal}/${goal}`;
    relay.appendChild(seg);
  }
  card.appendChild(relay);

  // Rallying line.
  const me = list.find((p) => p.isMe);
  const waiting = list.filter((p) => !p.done);
  let rally;
  if (!waiting.length) rally = t('team.allDone');
  else if (me && !me.done) rally = t('team.youNeed', { n: goal - me.stats.todayTotal });
  else if (waiting.length === 1) rally = t('team.waitingOn', { name: waiting[0].name, n: goal - waiting[0].stats.todayTotal });
  else rally = t('team.waitingMany', { n: waiting.length });
  card.appendChild(el('p', 'th-rally', rally));

  const total = el('p', 'th-total');
  total.append(countNum(allTime, 'num tiny'), t('team.together'));
  card.appendChild(total);
  return card;
}

function podium(list) {
  const top = list.slice(0, 3);
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  const wrap = el('section', `th-podium n${top.length}`);
  for (const p of order) {
    const col = el('div', `pod r${p.rank}`);
    const head = el('div', 'pod-head');
    if (p.rank === 1) head.appendChild(el('span', 'crown', '👑'));
    head.appendChild(avatar(p, 'lg'));
    col.append(head, el('span', 'pod-name', p.name));
    const pillar = el('div', 'pillar');
    pillar.append(el('b', 'pod-rank', p.rank), el('span', 'pod-streak', `🔥 ${p.stats.streak}`));
    col.appendChild(pillar);
    wrap.appendChild(col);
  }
  return wrap;
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
    day.append(el('i'), el('small', null, dateFmt({ weekday: 'narrow' }).format(d).toUpperCase()));
    strip.appendChild(day);
  }
  return strip;
}

function leaderRow(p, expanded, onToggle) {
  const { goal } = CONFIG;
  const { todayTotal, streak, missesLeft, completedDays, totalPushups, bestStreak } = p.stats;
  const row = el('div', `lb-row${p.isMe ? ' me' : ''}${expanded ? ' open' : ''}`);
  row.style.setProperty('--i', p.rank);

  const top = el('button', 'lb-top');
  top.type = 'button';
  top.setAttribute('aria-expanded', String(expanded));
  top.addEventListener('click', onToggle);

  const rank = el('span', `lb-rank r${Math.min(p.rank, 4)}`, p.rank);
  const main = el('div', 'lb-main');
  const name = el('div', 'lb-name');
  name.appendChild(el('b', null, p.name));
  if (p.isMe) name.appendChild(el('em', 'you', t('team.you')));
  for (const [cls, text] of badges(p)) name.appendChild(el('span', `badge ${cls}`, text));

  const bar = el('div', `lb-bar${p.done ? ' full' : todayTotal ? ' going' : ''}`);
  bar.style.setProperty('--p', Math.min(1, todayTotal / goal));
  bar.appendChild(el('i'));
  const barRow = el('div', 'lb-bar-row');
  barRow.append(bar, el('span', 'lb-count', `${todayTotal}/${goal}`));
  main.append(name, barRow);

  const stats = el('div', 'lb-stats');
  stats.append(el('span', 'lb-fire', `🔥${streak}`), el('span', 'lb-lives', `${missesLeft > 0 ? '💜' : '💔'}${Math.max(0, missesLeft)}`));

  top.append(rank, avatar(p), main, stats);
  row.appendChild(top);

  if (expanded) {
    const more = el('div', 'lb-more');
    const facts = el('div', 'lb-facts');
    const fact = (value, label) => {
      const f = el('div');
      f.append(el('b', null, value), el('span', null, label));
      facts.appendChild(f);
    };
    fact(num(totalPushups), t('cal.pushups'));
    fact(`${completedDays}/${p.stats.dayIndex}`, t('team.daysDone'));
    fact(bestStreak, t('team.bestStreak'));
    more.append(weekStrip(p.totals), facts);
    row.appendChild(more);
  }
  return row;
}

/* ---------- Page ---------- */

// actions: { lookup(code) → {team, members} | null, create(name) → team, join(team), leave(), enablePush(), dismissPush(),
//            openChat() }
// getData(): { team, entries, members, me, status, available, inviteCode, pushOffer, cheersOn, chatSub, unread }
export function createTeamPage(root, { getData, actions }) {
  // Local UI state that survives re-renders (inputs, errors, confirmations).
  const ui = {
    name: '', code: '', error: '', busy: false, confirm: null, leaving: false, copied: false,
    expanded: null, // name of the leaderboard row that is open
    animated: false, // the opening animation already ran since the page was opened
    celebrated: null, // day the "everyone's done" confetti last played
  };

  const run = async (fn) => {
    ui.busy = true;
    ui.error = '';
    render();
    try {
      await fn();
    } catch (err) {
      console.warn(err);
      ui.error = t(navigator.onLine === false || err.name === 'AbortError' || err instanceof TypeError
        ? 'team.errServer'
        : 'team.errOther');
    }
    ui.busy = false;
    render();
  };

  async function join(code) {
    const found = await actions.lookup(code);
    if (!found) {
      ui.error = t('team.noCode', { code: normalizeCode(code) });
      return;
    }
    const { me } = getData();
    if (found.members.some((m) => sameName(m, me))) {
      ui.confirm = found; // someone in the team already uses this name
      return;
    }
    await actions.join(found.team);
    ui.code = '';
  }

  const shareTeam = (team) => {
    const url = `${location.origin}${location.pathname}?team=${team.code}`;
    navigator.share({ title: t('app.title'), text: t('team.shareText', { team: team.name, code: team.code }), url }).catch(() => {});
  };

  function noTeamView(data) {
    const wrap = el('div', 'team-start');
    const intro = el('div', 'team-intro');
    intro.append(el('div', 'team-emoji', '👥'), el('h3', null, t('team.introTitle')), el('p', null, t('team.introText')));
    wrap.appendChild(intro);

    if (!data.available) {
      wrap.appendChild(el('p', 'team-error', t('team.notSetUp')));
      return wrap;
    }

    // Same-name check before joining.
    if (ui.confirm) {
      const card = el('div', 'team-card');
      card.append(
        el('h4', null, t('team.confirmTitle', { team: ui.confirm.team.name })),
        el('p', null, t('team.confirmText', { me: data.me })),
      );
      const row = el('div', 'team-row');
      row.append(
        button('team-btn ghost', t('team.cancel'), () => { ui.confirm = null; render(); }),
        button('team-btn', t('team.itsMe'), () => run(async () => {
          await actions.join(ui.confirm.team);
          ui.confirm = null;
          ui.code = '';
        })),
      );
      card.appendChild(row);
      wrap.appendChild(card);
      return wrap;
    }

    // Join with a code
    const joinCard = el('form', 'team-card');
    joinCard.appendChild(el('h4', null, t('team.join')));
    const codeInput = el('input', 'team-input code');
    Object.assign(codeInput, { id: 'teamCode', value: ui.code, placeholder: 'CODE', maxLength: 6, autocomplete: 'off', spellcheck: false });
    codeInput.setAttribute('autocapitalize', 'characters');
    codeInput.setAttribute('aria-label', t('team.codeLabel'));
    codeInput.addEventListener('input', () => {
      ui.code = normalizeCode(codeInput.value).slice(0, 6);
      codeInput.value = ui.code;
      joinBtn.disabled = ui.busy || ui.code.length !== 6;
    });
    const joinBtn = el('button', 'team-btn', ui.busy ? t('team.joining') : t('team.joinBtn'));
    joinBtn.type = 'submit';
    joinBtn.disabled = ui.busy || ui.code.length !== 6;
    joinCard.append(codeInput, joinBtn);
    joinCard.addEventListener('submit', (e) => {
      e.preventDefault();
      if (ui.code.length === 6) run(() => join(ui.code));
    });

    // Create a team
    const createCard = el('form', 'team-card');
    createCard.appendChild(el('h4', null, t('team.create')));
    const nameInput = el('input', 'team-input');
    Object.assign(nameInput, { id: 'teamName', value: ui.name, placeholder: t('team.namePlaceholder'), maxLength: 30, autocomplete: 'off' });
    nameInput.setAttribute('aria-label', t('team.namePlaceholder'));
    nameInput.addEventListener('input', () => {
      ui.name = nameInput.value;
      createBtn.disabled = ui.busy || !ui.name.trim();
    });
    const createBtn = el('button', 'team-btn', ui.busy ? t('team.creating') : t('team.createBtn'));
    createBtn.type = 'submit';
    createBtn.disabled = ui.busy || !ui.name.trim();
    createCard.append(nameInput, createBtn);
    createCard.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!ui.name.trim()) return;
      run(async () => {
        const team = await actions.create(ui.name.trim());
        await actions.join(team);
        ui.name = '';
      });
    });

    if (ui.error) wrap.appendChild(el('p', 'team-error', ui.error));
    wrap.append(joinCard, el('div', 'team-or', t('team.or')), createCard);
    return wrap;
  }

  function teamView(data) {
    const list = rankPeople(data.entries, data.me, data.members);
    const wrap = el('div', 'team-joined');

    // Team name and code
    const head = el('div', 'team-head');
    head.appendChild(el('h3', null, data.team.name));
    const codeRow = el('div', 'team-code-row');
    const codeEl = el('span', 'team-code', data.team.code);
    codeRow.append(el('span', 'team-code-label', t('team.code')), codeEl);
    codeRow.appendChild(button('team-chip', ui.copied ? t('team.copied') : t('team.copy'), async () => {
      try {
        await navigator.clipboard.writeText(data.team.code);
      } catch {
        // No clipboard (plain http): select the code so it can be copied by hand.
        const range = document.createRange();
        range.selectNodeContents(codeEl);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }
      ui.copied = true;
      render();
      setTimeout(() => { ui.copied = false; render(); }, 1800);
    }));
    if (navigator.share) codeRow.appendChild(button('team-chip', t('team.share'), () => shareTeam(data.team)));
    head.append(codeRow, el('p', 'sis-status', data.status));
    wrap.appendChild(head);

    // Opened from an invite link for another team.
    if (data.inviteCode && data.inviteCode !== data.team.code) {
      const note = el('div', 'team-card');
      note.append(el('p', null, t('team.invited', { code: data.inviteCode, team: data.team.name })));
      wrap.appendChild(note);
    }

    // Offer notifications once (until turned on or dismissed).
    if (data.pushOffer) {
      const offer = el('div', 'team-card th-push');
      offer.append(el('h4', null, t('team.pushTitle')), el('p', null, t('team.pushText')));
      const row = el('div', 'team-row');
      row.append(
        button('team-btn ghost', t('team.notNow'), () => { actions.dismissPush(); render(); }),
        button('team-btn', t('team.turnOn'), () => run(() => actions.enablePush())),
      );
      offer.appendChild(row);
      wrap.appendChild(offer);
    }

    wrap.appendChild(hero(list));

    // The team chat (when cheers are on).
    if (data.cheersOn) {
      const chat = button(`th-chat${data.unread ? ' unread' : ''}`, null, actions.openChat);
      const text = el('span', 'th-chat-text');
      text.append(el('b', null, t('chat.title')), el('small', null, data.chatSub));
      chat.append(el('span', 'th-chat-icon', '💬'), text, el('span', 'chev', '›'));
      wrap.appendChild(chat);
    }

    if (list.length > 1) {
      wrap.appendChild(podium(list));
    } else {
      const invite = el('div', 'team-card th-invite');
      invite.append(el('h4', null, t('team.inviteTitle')), el('p', null, t('team.inviteText', { code: data.team.code })));
      if (navigator.share) invite.appendChild(button('team-btn', t('team.shareInvite'), () => shareTeam(data.team)));
      wrap.appendChild(invite);
    }

    const board = el('section', 'th-board');
    board.appendChild(el('span', 'th-label', t('team.leaderboard')));
    for (const p of list) {
      const open = sameName(ui.expanded, p.name);
      board.appendChild(leaderRow(p, open, () => {
        ui.expanded = open ? null : p.name;
        render();
      }));
    }
    wrap.appendChild(board);

    const start = parseDay(CONFIG.startDate);
    wrap.appendChild(el('p', 'th-since', t('team.since', { date: dateFmt({ month: 'short', day: 'numeric' }).format(start), n: list.length })));

    const leave = button('team-leave', ui.leaving ? t('team.leaveConfirm') : t('team.leave'), () => {
      if (!ui.leaving) {
        ui.leaving = true;
        render();
        setTimeout(() => { ui.leaving = false; render(); }, 3000);
        return;
      }
      ui.leaving = false;
      run(() => actions.leave());
    });
    if (ui.leaving) leave.classList.add('armed');
    wrap.appendChild(leave);

    // Whole team done today: confetti once per day.
    if (list.length > 1 && list.every((p) => p.done) && ui.celebrated !== dayKey()) {
      ui.celebrated = dayKey();
      setTimeout(() => fx.celebrateConfetti(), 500);
    }
    return wrap;
  }

  // The first render after opening plays the entrance: podium rises, rows slide in,
  // numbers count up. Later refreshes (every minute) update quietly.
  function playEntrance(view) {
    view.classList.add('enter');
    if (reducedMotion()) return;
    for (const n of view.querySelectorAll('[data-count]')) {
      const to = Number(n.dataset.count);
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 900);
        n.textContent = num(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
      };
      n.textContent = '0';
      requestAnimationFrame(step);
    }
  }

  function render() {
    const data = getData();
    if (data.inviteCode && !data.team && !ui.code && !ui.confirm) ui.code = data.inviteCode;
    // Keep focus and caret in an input across re-renders.
    const focusedId = document.activeElement?.id;
    const view = data.team ? teamView(data) : noTeamView(data);
    root.replaceChildren(view);
    if (data.team && !ui.animated) {
      ui.animated = true;
      playEntrance(view);
    }
    if (focusedId) root.querySelector(`#${focusedId}`)?.focus();
  }

  return {
    render,
    reset() {
      Object.assign(ui, { error: '', confirm: null, leaving: false, busy: false, animated: false, expanded: null });
    },
  };
}
