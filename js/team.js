// Team page. Without a team it offers to create one or join one with a code;
// in a team it shows the team's name and code (to copy or share) and one card
// per person with today's progress, streak, skips left and their last seven days.
import { CONFIG } from './config.js';
import { computeStats, totalsByDay, dayKey, addDays, parseDay } from './stats.js';
import { sameName, normalizeCode } from './store.js';

const weekdayFmt = new Intl.DateTimeFormat('en', { weekday: 'narrow' });

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

/* ---------- Member cards ---------- */

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

function memberCards(entries, me) {
  const { goal } = CONFIG;
  const list = people(entries, me).sort((a, b) =>
    (b.stats.todayTotal >= goal) - (a.stats.todayTotal >= goal)
    || b.stats.streak - a.stats.streak
    || b.stats.todayTotal - a.stats.todayTotal);

  return list.map((p) => {
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
}

/* ---------- Page ---------- */

// actions: { lookup(code) → {team, members} | null, create(name) → team, join(team), leave() }
// getData(): { team, entries, me, status, available, inviteCode }
export function createTeamPage(root, { getData, actions }) {
  // Local UI state that survives re-renders (inputs, errors, confirmations).
  const ui = { name: '', code: '', error: '', busy: false, confirm: null, leaving: false, copied: false };

  const run = async (fn) => {
    ui.busy = true;
    ui.error = '';
    render();
    try {
      await fn();
    } catch (err) {
      console.warn(err);
      ui.error = navigator.onLine === false || err.name === 'AbortError' || err instanceof TypeError
        ? "Couldn't reach the server. Check your connection and try again."
        : 'Something went wrong. Please try again.';
    }
    ui.busy = false;
    render();
  };

  async function join(code) {
    const found = await actions.lookup(code);
    if (!found) {
      ui.error = `No team has the code ${normalizeCode(code)}. Check it and try again.`;
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

  function noTeamView(data) {
    const wrap = el('div', 'team-start');
    const intro = el('div', 'team-intro');
    intro.append(el('div', 'team-emoji', '👥'), el('h3', null, 'Push-ups are better together'),
      el('p', null, 'Create a team and share its code, or join a team with a code you got.'));
    wrap.appendChild(intro);

    if (!data.available) {
      wrap.appendChild(el('p', 'team-error', "Sharing isn't set up for this app yet (see the README)."));
      return wrap;
    }

    // Same-name check before joining.
    if (ui.confirm) {
      const card = el('div', 'team-card');
      card.append(
        el('h4', null, `Join “${ui.confirm.team.name}”?`),
        el('p', null, `Someone in this team is already called ${data.me}. If that's you on another device, your progress will be combined. If not, pick another name first.`),
      );
      const row = el('div', 'team-row');
      row.append(
        button('team-btn ghost', 'Cancel', () => { ui.confirm = null; render(); }),
        button('team-btn', "Yes, that's me", () => run(async () => {
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
    joinCard.appendChild(el('h4', null, 'Join a team'));
    const codeInput = el('input', 'team-input code');
    Object.assign(codeInput, { id: 'teamCode', value: ui.code, placeholder: 'CODE', maxLength: 6, autocomplete: 'off', spellcheck: false });
    codeInput.setAttribute('autocapitalize', 'characters');
    codeInput.setAttribute('aria-label', 'Team code');
    codeInput.addEventListener('input', () => {
      ui.code = normalizeCode(codeInput.value).slice(0, 6);
      codeInput.value = ui.code;
      joinBtn.disabled = ui.busy || ui.code.length !== 6;
    });
    const joinBtn = el('button', 'team-btn', ui.busy ? 'Joining…' : 'Join');
    joinBtn.type = 'submit';
    joinBtn.disabled = ui.busy || ui.code.length !== 6;
    joinCard.append(codeInput, joinBtn);
    joinCard.addEventListener('submit', (e) => {
      e.preventDefault();
      if (ui.code.length === 6) run(() => join(ui.code));
    });

    // Create a team
    const createCard = el('form', 'team-card');
    createCard.appendChild(el('h4', null, 'Create a team'));
    const nameInput = el('input', 'team-input');
    Object.assign(nameInput, { id: 'teamName', value: ui.name, placeholder: 'Team name', maxLength: 30, autocomplete: 'off' });
    nameInput.setAttribute('aria-label', 'Team name');
    nameInput.addEventListener('input', () => {
      ui.name = nameInput.value;
      createBtn.disabled = ui.busy || !ui.name.trim();
    });
    const createBtn = el('button', 'team-btn', ui.busy ? 'Creating…' : 'Create team');
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
    wrap.append(joinCard, el('div', 'team-or', 'or'), createCard);
    return wrap;
  }

  function teamView(data) {
    const wrap = el('div', 'team-joined');
    const head = el('div', 'team-head');
    head.appendChild(el('h3', null, data.team.name));

    const codeRow = el('div', 'team-code-row');
    codeRow.append(el('span', 'team-code-label', 'Code'), el('span', 'team-code', data.team.code));
    const copy = button('team-chip', ui.copied ? 'Copied ✓' : 'Copy', async () => {
      try {
        await navigator.clipboard.writeText(data.team.code);
      } catch {
        // No clipboard (plain http): select the code so it can be copied by hand.
        const range = document.createRange();
        range.selectNodeContents(codeRow.querySelector('.team-code'));
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }
      ui.copied = true;
      render();
      setTimeout(() => { ui.copied = false; render(); }, 1800);
    });
    codeRow.appendChild(copy);
    if (navigator.share) {
      codeRow.appendChild(button('team-chip', 'Share', () => {
        const url = `${location.origin}${location.pathname}?team=${data.team.code}`;
        navigator.share({ title: 'Pushup Challenge', text: `Join my pushup team “${data.team.name}” with code ${data.team.code}`, url }).catch(() => {});
      }));
    }
    head.append(codeRow, el('p', 'sis-status', data.status));
    wrap.appendChild(head);

    // Opened from an invite link for another team.
    if (data.inviteCode && data.inviteCode !== data.team.code) {
      const note = el('div', 'team-card');
      note.append(el('p', null, `You were invited to the team with code ${data.inviteCode}. Leave “${data.team.name}” to join it.`));
      wrap.appendChild(note);
    }

    wrap.append(...memberCards(data.entries, data.me));

    const leave = button('team-leave', ui.leaving ? 'Tap again to leave the team' : 'Leave team', () => {
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
    return wrap;
  }

  function render() {
    const data = getData();
    if (data.inviteCode && !data.team && !ui.code && !ui.confirm) ui.code = data.inviteCode;
    // Keep focus and caret in an input across re-renders.
    const focusedId = document.activeElement?.id;
    root.replaceChildren(data.team ? teamView(data) : noTeamView(data));
    if (focusedId) root.querySelector(`#${focusedId}`)?.focus();
  }

  return { render, reset() { Object.assign(ui, { error: '', confirm: null, leaving: false, busy: false }); } };
}
