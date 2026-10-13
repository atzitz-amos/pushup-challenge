// Cheers: the team chat, reactions on finished days, and in-app notifications.
// - createChat(): the chat page — messages, plus a card each time someone reaches the
//   daily goal, with reaction chips under it
// - summary(): the small pill on your own day cards (the reactions you got)
// - createBanner(): the notification that drops in from the top for new cheers
import { CONFIG } from './config.js';
import { dayKey, addDays, parseDay, diffDays } from './stats.js';
import { sameName, TEAM_CHAT } from './store.js';
import { t, dateFmt, capitalize } from './i18n.js';

export const REACTIONS = ['🔥', '💪', '👏', '😂', '❤️'];
const CHAT_DAYS = 7; // days shown at first; "Show earlier days" adds more

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function button(cls, text, onClick) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

const initial = (name) => [...name][0]?.toUpperCase() ?? '?';
const timeOf = (ts) => dateFmt({ hour: 'numeric', minute: '2-digit' }).format(ts);
const today = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

// "Today", "Yesterday", the weekday this week, or the date further back.
export function dayLabel(key) {
  const rel = diffDays(today(), parseDay(key));
  if (rel === 0) return t('day.today');
  if (rel === -1) return t('day.yesterday');
  if (rel > -7) return capitalize(dateFmt({ weekday: 'long' }).format(parseDay(key)));
  return capitalize(dateFmt({ weekday: 'long', month: 'short', day: 'numeric' }).format(parseDay(key)));
}

// Reactions on one person's day, by emoji (who gave them).
export function threadOf(cheers, owner, day) {
  const reactions = new Map(REACTIONS.map((e) => [e, []]));
  const comments = [];
  for (const c of cheers) {
    if (c.day !== day || !sameName(c.owner, owner)) continue;
    if (c.body) comments.push(c);
    else {
      if (!reactions.has(c.emoji)) reactions.set(c.emoji, []);
      reactions.get(c.emoji).push(c);
    }
  }
  return { owner, day, reactions, comments };
}

// The row of reaction chips. On your own day they only show what you got.
// Animated like Discord: a count that changed rolls to its new value (up or down),
// and the chip you just tapped bounces and lights up (or fades out when taken back).
//   prev(emoji): the count shown before (undefined: nothing to animate)
//   popped: { emoji, added } for the chip you just tapped
function reactionBar(thread, me, { onToggle, popped = null, prev = () => undefined } = {}) {
  const mine = sameName(thread.owner, me);
  const bar = el('div', `cheer-bar${mine ? ' own' : ''}`);
  for (const [emoji, list] of thread.reactions) {
    const n = list.length;
    const before = prev(emoji);
    if (mine && !n && !before) continue;
    const reacted = list.some((c) => sameName(c.author, me));
    const chip = el(mine ? 'span' : 'button', `cheer-chip${reacted ? ' on' : ''}${n ? ' has' : ''}`);
    chip.append(el('span', 'cheer-emoji', emoji));
    if (before !== undefined && before !== n) {
      // Old number out, new number in, like an odometer.
      const roll = el('span', `cheer-n roll ${n > before ? 'up' : 'down'}`);
      const from = el('i', 'from', before || '');
      roll.append(from, el('i', 'to', n || ''));
      from.addEventListener('animationend', () => from.remove());
      setTimeout(() => from.remove(), 600); // in case the animation never ran (page in the background)
      chip.append(roll);
    } else if (n) {
      chip.append(el('span', 'cheer-n', n));
    }
    if (!mine) {
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(reacted));
      chip.setAttribute('aria-label', t('cheer.react', { emoji }));
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        onToggle(emoji, reacted);
      });
    }
    if (popped?.emoji === emoji) chip.classList.add(popped.added ? 'lit' : 'unlit');
    bar.appendChild(chip);
  }
  return bar;
}

// Who reacted: "🔥 Mia, you · 💪 Lea".
function whoReacted(thread, me) {
  const parts = [];
  for (const [emoji, list] of thread.reactions) {
    if (!list.length) continue;
    parts.push(`${emoji} ${list.map((c) => (sameName(c.author, me) ? t('cheer.you') : c.author)).join(', ')}`);
  }
  return parts.join(' · ');
}

/* ---------- Under your own day cards ---------- */

// A small pill for one of your days: the top reactions with their total ("🔥💪 3").
// Nothing when nobody reacted yet.
export function summary(thread, onOpen) {
  const got = [...thread.reactions].filter(([, list]) => list.length).sort((a, b) => b[1].length - a[1].length);
  if (!got.length) return null;
  const pill = button('day-cheers', null, (e) => {
    e.stopPropagation();
    onOpen();
  });
  const emojis = el('span', 'day-cheers-emojis');
  for (const [emoji] of got.slice(0, 3)) emojis.appendChild(el('i', null, emoji));
  pill.append(emojis, el('b', null, got.reduce((s, [, list]) => s + list.length, 0)));
  pill.setAttribute('aria-label', t('chat.open'));
  return pill;
}

/* ---------- Chat page ---------- */

// When each person reached the goal, per day (from their push-ups), from a given day on.
function finishes(entries, members, goal, from) {
  const days = new Map();
  for (const e of [...entries].sort((a, b) => a.ts - b.ts)) {
    if (e.date < from) continue;
    const owner = members.find((m) => sameName(m, e.user));
    if (!owner) continue;
    const key = `${owner.toLowerCase()}|${e.date}`;
    const d = days.get(key) ?? { owner, day: e.date, sum: 0, ts: 0 };
    if (d.sum < goal && d.sum + e.count >= goal) d.ts = e.ts;
    d.sum += e.count;
    days.set(key, d);
  }
  return [...days.values()].filter((d) => d.ts).map((d) => ({ kind: 'finish', ...d }));
}

// root: the chat panel. getData(): { cheers, entries, members, me }
// actions: { react(owner, day, emoji) → added?, send(text), remove(id) }
export function createChat(root, { getData, actions }) {
  const list = root.querySelector('.chat-list');
  const form = root.querySelector('.chat-form');
  const input = form.querySelector('input');
  const send = form.querySelector('button');
  let days = CHAT_DAYS;
  let armed = null; // id of your message showing "Delete"
  let popped = null; // { key, emoji } of the chip just tapped
  // When each item first appeared: only ones that just arrived slide in (re-rendering after
  // a reaction must not replay every animation). Nothing animates when the chat opens.
  const firstSeen = new Map();
  let primed = false; // the first render since the chat opened is done
  const counts = new Map(); // reaction counts on screen, to animate the ones that change
  let nextCounts = new Map();

  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;

  function finishCard(item, data) {
    const mine = sameName(item.owner, data.me);
    const thread = threadOf(data.cheers, item.owner, item.day);
    const key = `${item.owner}|${item.day}`;
    const card = el('div', `chat-finish${mine ? ' mine' : ''}`);
    card.dataset.key = key.toLowerCase();
    const head = el('div', 'chat-finish-head');
    head.append(
      el('span', 'chat-finish-emoji', '🎉'),
      el('p', null, mine ? t('chat.finishedMe', { goal: CONFIG.goal }) : t('chat.finished', { name: item.owner, goal: CONFIG.goal })),
      el('time', null, timeOf(item.ts)),
    );
    card.appendChild(head);
    card.appendChild(reactionBar(thread, data.me, {
      popped: popped?.key === key ? popped : null,
      prev: (emoji) => counts.get(`${key}|${emoji}`),
      onToggle(emoji, reacted) {
        // actions.react re-renders the chat, and that render plays the animation
        // (a second render here would cut it short).
        popped = { key, emoji, added: !reacted };
        actions.react(item.owner, item.day, emoji);
        popped = null;
      },
    }));
    for (const [emoji, list] of thread.reactions) nextCounts.set(`${key}|${emoji}`, list.length);
    const names = whoReacted(thread, data.me);
    if (names) card.appendChild(el('p', 'chat-who', names));
    return card;
  }

  function bubble(c, prev, data) {
    const own = sameName(c.author, data.me);
    const grouped = prev && prev.kind === 'message' && sameName(prev.author, c.author) && c.ts - prev.ts < 5 * 60 * 1000;
    const b = el('div', `bubble${own ? ' own' : ''}${grouped ? ' grouped' : ''}${c.up === false ? ' sending' : ''}`);
    if (!own && !grouped) b.appendChild(el('b', 'bubble-name', c.author));
    // Written about one day (older version of cheers): say whose.
    if (!sameName(c.owner, TEAM_CHAT)) {
      b.appendChild(el('small', 'bubble-about', sameName(c.owner, data.me) ? t('cheer.bOnYour') : t('cheer.bOnDay', { name: c.owner })));
    }
    b.appendChild(el('p', null, c.body));
    b.appendChild(el('time', null, timeOf(c.ts)));
    if (own) {
      b.addEventListener('click', () => {
        armed = armed === c.id ? null : c.id;
        render();
      });
      if (armed === c.id) {
        b.classList.add('armed');
        b.appendChild(button('bubble-delete', t('cheer.delete'), (e) => {
          e.stopPropagation();
          armed = null;
          actions.remove(c.id);
          render();
        }));
      }
    }
    return b;
  }

  function render({ scroll = false } = {}) {
    const data = getData();
    const first = dayKey(addDays(today(), -(days - 1)));
    const from = CONFIG.startDate > first ? CONFIG.startDate : first;
    const fromTs = parseDay(from).getTime();
    const items = [
      ...finishes(data.entries, data.members, CONFIG.goal, from),
      ...data.cheers.filter((c) => c.body && c.ts >= fromTs).map((c) => ({ kind: 'message', ...c })),
    ].sort((a, b) => a.ts - b.ts);

    const stick = scroll || nearBottom();
    const nodes = [];
    if (from > CONFIG.startDate) {
      nodes.push(button('chat-earlier', t('chat.earlier'), () => {
        const height = list.scrollHeight;
        days += CHAT_DAYS;
        render();
        list.scrollTop += list.scrollHeight - height; // stay where you were reading
      }));
    }
    if (!items.length) nodes.push(el('p', 'chat-empty', t('chat.empty')));
    let lastDay = '';
    nextCounts = new Map();
    items.forEach((item, i) => {
      const day = item.kind === 'finish' ? item.day : dayKey(new Date(item.ts));
      if (day !== lastDay) {
        nodes.push(el('div', 'chat-day', dayLabel(day)));
        lastDay = day;
      }
      const node = item.kind === 'finish' ? finishCard(item, data) : bubble(item, items[i - 1], data);
      const key = item.kind === 'finish' ? `f:${item.owner.toLowerCase()}|${item.day}` : `m:${item.id}`;
      if (!firstSeen.has(key)) firstSeen.set(key, primed ? Date.now() : 0);
      if (Date.now() - firstSeen.get(key) < 400) node.classList.add('new');
      nodes.push(node);
    });
    primed = true;
    counts.clear();
    for (const [k, v] of nextCounts) counts.set(k, v);
    list.replaceChildren(...nodes);
    if (stick) {
      list.scrollTop = list.scrollHeight;
      // When the page is only just being shown it has no height yet: again once it does.
      requestAnimationFrame(() => (list.scrollTop = list.scrollHeight));
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    actions.send(text);
    input.value = '';
    send.disabled = true;
    render({ scroll: true });
  });
  input.addEventListener('input', () => {
    send.disabled = !input.value.trim();
  });

  // Phone keyboards cover the bottom of the screen: lift the text box above it.
  const vv = window.visualViewport;
  const fitKeyboard = () => {
    const kb = vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
    root.style.setProperty('--kb', `${kb}px`);
    if (kb && document.activeElement === input) list.scrollTop = list.scrollHeight;
  };
  vv?.addEventListener('resize', fitKeyboard);
  vv?.addEventListener('scroll', fitKeyboard);

  return {
    render,
    // Scrolls to someone's "finished" card for a day and makes it glow (from a banner or a day pill).
    show(owner, day) {
      const card = owner && list.querySelector(`[data-key="${CSS.escape(`${owner}|${day}`.toLowerCase())}"]`);
      if (!card) {
        list.scrollTop = list.scrollHeight;
        return;
      }
      card.scrollIntoView({ block: 'center' });
      card.classList.remove('flash');
      void card.offsetWidth;
      card.classList.add('flash');
    },
    reset() {
      days = CHAT_DAYS;
      firstSeen.clear();
      counts.clear();
      primed = false;
      armed = null;
      input.blur();
    },
  };
}

/* ---------- In-app banner ---------- */

// A notification that drops in from the top while the app is open: tap it to see
// the cheer, swipe it up to dismiss. Several arrive one after another.
// item: { avatar, title, text, emoji?, target }   onOpen(target)
export function createBanner({ onOpen }) {
  const root = el('div', 'cheer-banner');
  root.setAttribute('role', 'status');
  root.hidden = true;
  document.body.appendChild(root);
  let queue = [];
  let current = null;
  let timer = 0;

  function display(item) {
    current = item;
    const ava = el('div', 'cheer-banner-ava', item.avatar);
    const text = el('div', 'cheer-banner-text');
    text.append(el('b', null, item.title), el('p', null, item.text));
    root.replaceChildren(ava, text, ...(item.emoji ? [el('span', 'cheer-banner-emoji', item.emoji)] : []));
    root.style.transform = '';
    root.hidden = false;
    void root.offsetWidth;
    root.classList.add('show');
    timer = setTimeout(next, 4500);
  }

  // Slides the current banner away, then shows the next one (if any).
  function next() {
    clearTimeout(timer);
    root.classList.remove('show');
    root.style.transform = '';
    const was = current;
    current = null;
    setTimeout(() => {
      if (current) return;
      if (queue.length) display(queue.shift());
      else root.hidden = true;
    }, was ? 350 : 0);
  }

  // Tap to open, swipe up to dismiss.
  let start = null;
  root.addEventListener('pointerdown', (e) => {
    start = { y: e.clientY, dy: 0 };
    root.setPointerCapture(e.pointerId);
    root.classList.add('dragging');
    clearTimeout(timer);
  });
  root.addEventListener('pointermove', (e) => {
    if (!start) return;
    start.dy = e.clientY - start.y;
    root.style.transform = `translate(-50%, ${Math.min(0, start.dy) + Math.max(0, start.dy) * 0.2}px)`;
  });
  const release = () => {
    if (!start) return;
    const { dy } = start;
    start = null;
    root.classList.remove('dragging');
    if (Math.abs(dy) < 8 && current) {
      const target = current.target;
      queue = [];
      next();
      onOpen(target);
    } else if (dy < -30) {
      next();
    } else {
      root.style.transform = '';
      timer = setTimeout(next, 2500);
    }
  };
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);

  return {
    show(items) {
      queue.push(...items);
      if (!current && root.hidden) next();
    },
  };
}
