// Cheers: reactions and comments on someone's day.
// - feed(): the team page's "Cheer them on" cards (last 7 days, newest activity first)
// - summary(): the small line of cheers under your own day cards
// - createThread(): the sheet with a day's reactions and comments, and a text box
import { CONFIG } from './config.js';
import { dayKey, addDays, parseDay, diffDays } from './stats.js';
import { sameName } from './store.js';
import { t, dateFmt, capitalize } from './i18n.js';

export const REACTIONS = ['🔥', '💪', '👏', '😂', '❤️'];
const FEED_DAYS = 7;
const FEED_SHOWN = 6; // cards before "Show more"

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

// "Today", "Yesterday", or the weekday.
export function dayLabel(key) {
  const now = new Date();
  const rel = diffDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), parseDay(key));
  if (rel === 0) return t('day.today');
  if (rel === -1) return t('day.yesterday');
  return capitalize(dateFmt({ weekday: 'long' }).format(parseDay(key)));
}

// Everything about one person's day: reactions by emoji (who gave them) and comments.
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
  const last = Math.max(0, ...[...reactions.values()].flat().map((c) => c.ts), ...comments.map((c) => c.ts));
  return { owner, day, reactions, comments, last };
}

// The row of reaction chips. On your own day they only show what you got.
function reactionBar(thread, me, { onToggle, big = false, popped = null } = {}) {
  const mine = sameName(thread.owner, me);
  const bar = el('div', `cheer-bar${big ? ' big' : ''}${mine ? ' own' : ''}`);
  for (const [emoji, list] of thread.reactions) {
    if (mine && !list.length) continue;
    const reacted = list.some((c) => sameName(c.author, me));
    const chip = el(mine ? 'span' : 'button', `cheer-chip${reacted ? ' on' : ''}${list.length ? ' has' : ''}`);
    chip.append(el('span', 'cheer-emoji', emoji));
    if (list.length) chip.append(el('b', null, list.length));
    if (!mine) {
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(reacted));
      chip.setAttribute('aria-label', t('cheer.react', { emoji }));
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        onToggle(emoji);
      });
    }
    if (popped === emoji) chip.classList.add('pop');
    bar.appendChild(chip);
  }
  return bar;
}

// Who reacted, for the thread: "🔥 Mia, you · 💪 Lea".
function whoReacted(thread, me) {
  const parts = [];
  for (const [emoji, list] of thread.reactions) {
    if (!list.length) continue;
    parts.push(`${emoji} ${list.map((c) => (sameName(c.author, me) ? t('cheer.you') : c.author)).join(', ')}`);
  }
  return parts.join(' · ');
}

/* ---------- Team page feed ---------- */

// data: { entries, cheers, members, me, ui: { feedAll, popped } }
// actions: { react(owner, day, emoji), open(owner, day), toggleAll() }
export function feed(data, actions) {
  const { goal } = CONFIG;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const first = dayKey(addDays(today, -(FEED_DAYS - 1)));
  const start = CONFIG.startDate > first ? CONFIG.startDate : first;

  // One card per person and day with push-ups or cheers.
  const days = new Map();
  const card = (owner, day) => {
    const key = `${owner.toLowerCase()}|${day}`;
    if (!days.has(key)) days.set(key, { owner, day, total: 0, lastSet: 0 });
    return days.get(key);
  };
  const member = (name) => data.members.find((m) => sameName(m, name));
  for (const e of data.entries) {
    if (e.date < start || !member(e.user)) continue;
    const c = card(member(e.user), e.date);
    c.total += e.count;
    c.lastSet = Math.max(c.lastSet, e.ts);
  }
  for (const c of data.cheers) if (c.day >= start && member(c.owner)) card(member(c.owner), c.day);
  const items = [...days.values()].map((d) => {
    const thread = threadOf(data.cheers, d.owner, d.day);
    // Ordered by the latest push-ups (not by cheers, so a card never jumps away when you react to it).
    return { ...d, thread, last: d.lastSet || thread.last };
  });
  items.sort((a, b) => b.last - a.last);

  const section = el('section', 'cheer-feed');
  section.appendChild(el('span', 'th-label', t('cheer.title')));
  if (!items.length) {
    section.appendChild(el('p', 'cheer-empty', t('cheer.empty')));
    return section;
  }
  const shown = data.ui.feedAll ? items : items.slice(0, FEED_SHOWN);
  for (const item of shown) {
    const mine = sameName(item.owner, data.me);
    const done = item.total >= goal;
    const box = el('article', `cheer-card${mine ? ' mine' : ''}${done ? ' complete' : ''}`);
    box.tabIndex = 0;
    box.setAttribute('role', 'button');
    box.setAttribute('aria-label', mine ? t('cheer.yourDay') : t('cheer.dayOf', { name: item.owner }));
    box.addEventListener('click', () => actions.open(item.owner, item.day));
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        actions.open(item.owner, item.day);
      }
    });

    const head = el('div', 'cheer-head');
    const ava = el('div', 'ava', initial(item.owner));
    ava.style.setProperty('--p', Math.min(1, item.total / goal));
    const who = el('div', 'cheer-who');
    who.append(el('b', null, mine ? t('cheer.yourDay') : item.owner), el('span', null, dayLabel(item.day)));
    const score = el('span', `cheer-score${done ? ' complete' : ''}`, done ? `✅ ${item.total}` : `${item.total}/${goal}`);
    head.append(ava, who, score);
    box.appendChild(head);

    const foot = el('div', 'cheer-foot');
    const popped = data.ui.popped?.key === `${item.owner}|${item.day}` ? data.ui.popped.emoji : null;
    foot.appendChild(reactionBar(item.thread, data.me, { onToggle: (emoji) => actions.react(item.owner, item.day, emoji), popped }));
    const n = item.thread.comments.length;
    foot.appendChild(el('span', `cheer-count${n ? ' has' : ''}`, n ? `💬 ${n}` : '💬'));
    box.appendChild(foot);

    const lastComment = item.thread.comments.at(-1);
    if (lastComment) {
      const quote = el('p', 'cheer-quote');
      quote.append(el('b', null, `${sameName(lastComment.author, data.me) ? t('cheer.you') : lastComment.author} `), lastComment.body);
      box.appendChild(quote);
    }
    section.appendChild(box);
  }
  if (items.length > FEED_SHOWN) {
    section.appendChild(button('cheer-more', data.ui.feedAll ? t('cheer.less') : t('cheer.more', { n: items.length - FEED_SHOWN }), actions.toggleAll));
  }
  return section;
}

/* ---------- Under your own day cards ---------- */

// A small pill for one of your days: the top reactions with their total, and the
// number of comments ("🔥💪 3 💬 1"). Nothing when nobody cheered yet.
export function summary(thread, onOpen) {
  const got = [...thread.reactions].filter(([, list]) => list.length).sort((a, b) => b[1].length - a[1].length);
  if (!got.length && !thread.comments.length) return null;
  const pill = button('day-cheers', null, (e) => {
    e.stopPropagation();
    onOpen();
  });
  if (got.length) {
    const emojis = el('span', 'day-cheers-emojis');
    for (const [emoji] of got.slice(0, 3)) emojis.appendChild(el('i', null, emoji));
    pill.append(emojis, el('b', null, got.reduce((s, [, list]) => s + list.length, 0)));
  }
  if (thread.comments.length) pill.append(el('i', null, '💬'), el('b', null, thread.comments.length));
  pill.setAttribute('aria-label', t('cheer.openThread'));
  return pill;
}

/* ---------- Thread sheet ---------- */

// root: the sheet backdrop element (hidden). sheet: { open(), close() } from nav.createSheet.
// getData(): { cheers, entries, me }   actions: { react(owner, day, emoji), comment(owner, day, text), remove(id), opened(), closed() }
export function createThread(root, sheet, { getData, actions }) {
  const panel = root.querySelector('.thread');
  const head = panel.querySelector('.thread-head');
  const reactions = panel.querySelector('.thread-reactions');
  const list = panel.querySelector('.thread-list');
  const form = panel.querySelector('.thread-form');
  const input = form.querySelector('input');
  const send = form.querySelector('button');
  let current = null; // { owner, day }
  let armed = null; // id of your comment showing "Delete"
  let popped = null;

  const atBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 40;

  function render({ scroll = false } = {}) {
    if (!current) return;
    const { cheers, entries, me } = getData();
    const { goal } = CONFIG;
    const thread = threadOf(cheers, current.owner, current.day);
    const mine = sameName(current.owner, me);
    const total = entries.filter((e) => e.date === current.day && sameName(e.user, current.owner)).reduce((s, e) => s + e.count, 0);

    const ava = el('div', 'ava', initial(current.owner));
    ava.style.setProperty('--p', Math.min(1, total / goal));
    const who = el('div', 'cheer-who');
    who.append(
      el('b', null, mine ? t('cheer.yourDay') : t('cheer.dayOf', { name: current.owner })),
      el('span', null, `${dayLabel(current.day)} · ${total >= goal ? `✅ ${total}` : `${total}/${goal}`}`),
    );
    const close = button('icon-btn thread-close', '✕', () => sheet.close());
    close.setAttribute('aria-label', t('cheer.close'));
    head.replaceChildren(ava, who, close);

    const bar = reactionBar(thread, me, {
      big: true,
      popped,
      onToggle: (emoji) => {
        popped = emoji;
        actions.react(current.owner, current.day, emoji);
        render();
        popped = null;
      },
    });
    const names = whoReacted(thread, me);
    reactions.replaceChildren(bar, ...(names ? [el('p', 'thread-who', names)] : []));

    const stick = scroll || atBottom();
    if (!thread.comments.length) {
      list.replaceChildren(el('p', 'thread-empty', mine ? t('cheer.noCommentsMine') : t('cheer.noComments')));
    } else {
      list.replaceChildren(...thread.comments.map((c, i) => {
        const own = sameName(c.author, me);
        const prev = thread.comments[i - 1];
        const bubble = el('div', `bubble${own ? ' own' : ''}${c.up === false ? ' sending' : ''}`);
        if (!own && !(prev && sameName(prev.author, c.author))) bubble.appendChild(el('b', 'bubble-name', c.author));
        bubble.appendChild(el('p', null, c.body));
        bubble.appendChild(el('time', null, timeOf(c.ts)));
        if (own) {
          bubble.addEventListener('click', () => {
            armed = armed === c.id ? null : c.id;
            render();
          });
          if (armed === c.id) {
            bubble.classList.add('armed');
            bubble.appendChild(button('bubble-delete', t('cheer.delete'), (e) => {
              e.stopPropagation();
              armed = null;
              actions.remove(c.id);
              render();
            }));
          }
        }
        return bubble;
      }));
    }
    if (stick) list.scrollTop = list.scrollHeight;
  }

  function submit() {
    const text = input.value.trim();
    if (!text || !current) return;
    actions.comment(current.owner, current.day, text);
    input.value = '';
    send.disabled = true;
    render({ scroll: true });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  input.addEventListener('input', () => {
    send.disabled = !input.value.trim();
  });

  // Phone keyboards cover the bottom of the screen: lift the sheet above it.
  const vv = window.visualViewport;
  const fitKeyboard = () => {
    const kb = vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
    root.style.setProperty('--kb', `${kb}px`);
    if (kb && document.activeElement === input) list.scrollTop = list.scrollHeight;
  };
  vv?.addEventListener('resize', fitKeyboard);
  vv?.addEventListener('scroll', fitKeyboard);

  // Closing from the sheet (backdrop tap) or the ✕ both end up here.
  const observer = new MutationObserver(() => {
    if (current && !root.classList.contains('open')) {
      current = null;
      armed = null;
      input.blur();
      actions.closed();
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });

  return {
    get isOpen() {
      return !!current;
    },
    isShowing(owner, day) {
      return !!current && current.day === day && sameName(current.owner, owner);
    },
    open(owner, day) {
      current = { owner, day };
      armed = null;
      input.value = '';
      send.disabled = true;
      input.placeholder = t('cheer.placeholder');
      send.setAttribute('aria-label', t('cheer.send'));
      render({ scroll: true });
      sheet.open();
      actions.opened();
    },
    close() {
      sheet.close();
    },
    render,
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
