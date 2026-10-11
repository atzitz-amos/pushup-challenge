// Settings page: the challenge rules (daily goal, skips allowed, last day).
// In a team they are the team's rules and changes apply to everyone.
import { CONFIG } from './config.js';
import { parseDay, addDays, diffDays, dayKey } from './stats.js';

const longDate = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// − value + control; holding a button keeps counting. unit(value) gives the label.
function stepper({ value, min, max, unit, onChange }) {
  const wrap = el('div', 'stepper');
  const num = el('b', 'num', value);
  const label = el('span', null, unit(value));
  const set = (v) => {
    v = Math.min(max, Math.max(min, v));
    if (v === value) return;
    value = v;
    num.textContent = v;
    label.textContent = unit(v);
    minus.disabled = v <= min;
    plus.disabled = v >= max;
    onChange(v);
  };
  const holdable = (label, delta, aria) => {
    const b = el('button', 'step-btn', label);
    b.type = 'button';
    b.setAttribute('aria-label', aria);
    let timer;
    const stop = () => clearTimeout(timer);
    b.addEventListener('pointerdown', () => {
      set(value + delta);
      const repeat = (wait) => { timer = setTimeout(() => { set(value + delta); repeat(70); }, wait); };
      repeat(400);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(value + delta); } });
    return b;
  };
  const minus = holdable('−', -1, 'Less');
  const plus = holdable('+', 1, 'More');
  minus.disabled = value <= min;
  plus.disabled = value >= max;
  const mid = el('div', 'step-value');
  mid.append(num, label);
  wrap.append(minus, mid, plus);
  return { el: wrap, set };
}

// getContext(): { rules, teamName, push: { supported, reason, enabled } }
// save(rules), togglePush(on), resetProgress(), startOver() → Promise
export function createSettingsPage(root, { getContext, save, togglePush, resetProgress, startOver }) {
  let draft = null;
  let status = ''; // '', 'saving', 'saved', or an error message
  let pushNote = ''; // message under the notifications switch
  let armed = null; // 'progress' | 'all': waiting for the confirming second tap
  let armTimer = 0;
  let resetNote = '';

  function render() {
    const { rules, teamName } = getContext();
    draft ||= { ...rules };
    const changed = JSON.stringify(draft) !== JSON.stringify(rules);
    const start = parseDay(CONFIG.startDate);

    const wrap = el('div', 'settings');
    wrap.appendChild(el('span', 'th-label', 'Challenge rules'));
    wrap.appendChild(el('p', 'set-scope', teamName
      ? `Shared with “${teamName}”: changes apply to everyone in the team.`
      : 'Just for you. Join a team to share rules with others.'));

    // Daily goal
    const goalCard = el('section', 'set-card');
    goalCard.appendChild(el('h4', null, 'Daily goal'));
    const goal = stepper({ value: draft.goal, min: 1, max: 100, unit: () => 'push-ups a day', onChange: (v) => { draft.goal = v; refresh(); } });
    const presets = el('div', 'set-presets');
    for (const v of [10, 20, 30, 50, 100]) {
      const chip = el('button', `set-chip${draft.goal === v ? ' on' : ''}`, v);
      chip.type = 'button';
      chip.addEventListener('click', () => { goal.set(v); render(); });
      presets.appendChild(chip);
    }
    goalCard.append(goal.el, presets);

    // Skips
    const missCard = el('section', 'set-card');
    missCard.appendChild(el('h4', null, 'Skips allowed'));
    missCard.appendChild(stepper({
      value: draft.allowedMisses, min: 0, max: 30, unit: (v) => (v === 1 ? 'day you can miss' : 'days you can miss'),
      onChange: (v) => { draft.allowedMisses = v; refresh(); },
    }).el);

    // Last day
    const endCard = el('section', 'set-card');
    endCard.appendChild(el('h4', null, 'Last day'));
    const dateInput = el('input', 'set-date');
    Object.assign(dateInput, { type: 'date', id: 'setEnd', value: draft.endDate, min: dayKey(addDays(start, 1)), max: dayKey(addDays(start, 365)) });
    dateInput.setAttribute('aria-label', 'Last day of the challenge');
    dateInput.addEventListener('change', () => {
      if (dateInput.value && dateInput.value >= dateInput.min && dateInput.value <= dateInput.max) draft.endDate = dateInput.value;
      render();
    });
    const days = diffDays(start, parseDay(draft.endDate)) + 1;
    endCard.append(dateInput, el('p', 'set-hint', `${longDate.format(parseDay(draft.endDate))} · ${days} days in total`));

    // Save
    const saveBtn = el('button', 'team-btn set-save',
      status === 'saving' ? 'Saving…' : status === 'saved' && !changed ? 'Saved ✓' : 'Save changes');
    saveBtn.type = 'button';
    saveBtn.disabled = !changed || status === 'saving';
    saveBtn.addEventListener('click', async () => {
      status = 'saving';
      render();
      try {
        await save({ ...draft });
        status = 'saved';
      } catch (err) {
        console.warn(err);
        status = navigator.onLine === false || err.name === 'AbortError' || err instanceof TypeError
          ? "Couldn't reach the server, so nothing changed. Try again when you're online."
          : 'Something went wrong, so nothing changed. Please try again.';
      }
      render();
    });

    wrap.append(goalCard, missCard, endCard);
    if (status && !['saving', 'saved'].includes(status)) wrap.appendChild(el('p', 'team-error', status));
    wrap.append(saveBtn, el('p', 'set-hint center', 'Past days are checked again against the new rules.'));

    // Notifications
    const { push } = getContext();
    wrap.appendChild(el('span', 'th-label set-section', 'Notifications'));
    const notifyCard = el('section', 'set-card');
    const toggle = el('button', 'set-toggle');
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(push.enabled));
    toggle.disabled = !push.supported;
    const text = el('span', 'mi-text');
    text.append(el('b', null, 'Team notifications'), el('small', null, 'Get a notification when someone in your team saves push-ups.'));
    toggle.append(el('span', 'mi-icon', '🔔'), text, el('span', 'switch'));
    toggle.addEventListener('click', async () => {
      toggle.disabled = true;
      try {
        await togglePush(!push.enabled);
        pushNote = '';
      } catch (err) {
        pushNote = err.code === 'denied'
          ? "Notifications weren't allowed. You can allow them in your phone settings."
          : "Couldn't change notifications. Check your connection and try again.";
      }
      render();
    });
    notifyCard.appendChild(toggle);
    const note = !push.supported ? push.reason : pushNote || (push.enabled && !getContext().teamName ? "You'll get notifications once you're in a team." : '');
    if (note) notifyCard.appendChild(el('p', 'set-hint', note));
    wrap.appendChild(notifyCard);

    // Reset (each button needs a second tap to confirm)
    wrap.appendChild(el('span', 'th-label set-section', 'Reset'));
    const resetCard = el('section', 'set-card');
    const danger = (key, label, confirmLabel, hint, action, done) => {
      const b = el('button', `set-danger${armed === key ? ' armed' : ''}`, armed === key ? confirmLabel : label);
      b.type = 'button';
      b.addEventListener('click', async () => {
        if (armed !== key) {
          armed = key;
          resetNote = '';
          clearTimeout(armTimer);
          armTimer = setTimeout(() => { armed = null; render(); }, 3500);
          render();
          return;
        }
        armed = null;
        clearTimeout(armTimer);
        b.disabled = true;
        try {
          await action();
          resetNote = done;
        } catch (err) {
          console.warn(err);
          resetNote = "Couldn't reach the server, so nothing was deleted. Try again when you're online.";
        }
        render();
      });
      resetCard.append(b, el('p', 'set-hint', hint));
    };
    danger('progress', 'Reset my progress', 'Tap again to delete all your push-ups',
      teamName ? `Deletes all your push-ups, on this phone and in “${teamName}”. Your name, team and settings stay.`
        : 'Deletes all your push-ups on this phone. Your name and settings stay.',
      resetProgress, 'Your progress was reset.');
    danger('all', 'Start over on this phone', 'Tap again to start over',
      'Leaves your team and forgets your name, settings and push-ups on this phone. What you saved in a team stays there.',
      startOver, '');
    if (resetNote) resetCard.appendChild(el('p', resetNote.startsWith("Couldn't") ? 'team-error' : 'set-hint', resetNote));
    wrap.appendChild(resetCard);

    root.replaceChildren(wrap);

    // Lightweight update while stepping (re-rendering would interrupt a held button).
    function refresh() {
      for (const chip of presets.children) chip.classList.toggle('on', Number(chip.textContent) === draft.goal);
      const now = JSON.stringify(draft) !== JSON.stringify(getContext().rules);
      saveBtn.disabled = !now || status === 'saving';
      saveBtn.textContent = 'Save changes';
    }
  }

  return {
    render,
    // Start from the rules in effect each time the page opens.
    reset() {
      draft = null;
      status = '';
      armed = null;
      resetNote = '';
    },
  };
}
