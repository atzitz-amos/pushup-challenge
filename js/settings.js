// Settings page: the challenge rules (daily goal, skips allowed, last day).
// In a team they are the team's rules and changes apply to everyone.
import { CONFIG } from './config.js';
import { parseDay, addDays, diffDays, dayKey } from './stats.js';
import { t, dateFmt, LANGS } from './i18n.js';

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
  const minus = holdable('−', -1, t('set.less'));
  const plus = holdable('+', 1, t('set.more'));
  minus.disabled = value <= min;
  plus.disabled = value >= max;
  const mid = el('div', 'step-value');
  mid.append(num, label);
  wrap.append(minus, mid, plus);
  return { el: wrap, set };
}

// getContext(): { rules, teamName, push: { supported, reason, enabled }, lang }
// save(rules), togglePush(on), resetProgress(), startOver(), setLanguage(lang) → Promise
export function createSettingsPage(root, { getContext, save, togglePush, resetProgress, startOver, setLanguage }) {
  let draft = null;
  let status = ''; // '', 'saving', 'saved', or an error key (set.errServer / set.errOther)
  let pushNote = ''; // message under the notifications switch
  let armed = null; // 'progress' | 'all': waiting for the confirming second tap
  let armTimer = 0;
  let resetNote = ''; // key of the message under the reset buttons

  function render() {
    const { rules, teamName } = getContext();
    draft ||= { ...rules };
    const changed = JSON.stringify(draft) !== JSON.stringify(rules);
    const start = parseDay(CONFIG.startDate);

    const wrap = el('div', 'settings');
    // Language (first, so it's easy to find in either language)
    wrap.appendChild(el('span', 'th-label', t('set.language')));
    const langs = el('div', 'set-langs');
    for (const [code, label] of Object.entries(LANGS)) {
      const b = el('button', `set-lang${getContext().lang === code ? ' on' : ''}`, label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(getContext().lang === code));
      b.addEventListener('click', () => { if (getContext().lang !== code) setLanguage(code); });
      langs.appendChild(b);
    }
    wrap.appendChild(langs);

    wrap.appendChild(el('span', 'th-label set-section', t('set.rules')));
    wrap.appendChild(el('p', 'set-scope', teamName ? t('set.shared', { team: teamName }) : t('set.personal')));

    // Daily goal
    const goalCard = el('section', 'set-card');
    goalCard.appendChild(el('h4', null, t('set.goal')));
    const goal = stepper({ value: draft.goal, min: 1, max: 100, unit: () => t('set.goalUnit'), onChange: (v) => { draft.goal = v; refresh(); } });
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
    missCard.appendChild(el('h4', null, t('set.skips')));
    missCard.appendChild(stepper({
      value: draft.allowedMisses, min: 0, max: 30, unit: (v) => t('set.skipsUnit', { n: v }),
      onChange: (v) => { draft.allowedMisses = v; refresh(); },
    }).el);

    // Last day
    const endCard = el('section', 'set-card');
    endCard.appendChild(el('h4', null, t('set.end')));
    const dateInput = el('input', 'set-date');
    Object.assign(dateInput, { type: 'date', id: 'setEnd', value: draft.endDate, min: dayKey(addDays(start, 1)), max: dayKey(addDays(start, 365)) });
    dateInput.setAttribute('aria-label', t('set.endLabel'));
    dateInput.addEventListener('change', () => {
      if (dateInput.value && dateInput.value >= dateInput.min && dateInput.value <= dateInput.max) draft.endDate = dateInput.value;
      render();
    });
    const days = diffDays(start, parseDay(draft.endDate)) + 1;
    const endDate = dateFmt({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(parseDay(draft.endDate));
    endCard.append(dateInput, el('p', 'set-hint', t('set.endHint', { date: endDate, n: days })));

    // Save
    const saveBtn = el('button', 'team-btn set-save',
      status === 'saving' ? t('set.saving') : status === 'saved' && !changed ? t('set.saved') : t('set.save'));
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
          ? 'set.errServer'
          : 'set.errOther';
      }
      render();
    });

    wrap.append(goalCard, missCard, endCard);
    if (status && !['saving', 'saved'].includes(status)) wrap.appendChild(el('p', 'team-error', t(status)));
    wrap.append(saveBtn, el('p', 'set-hint center', t('set.recheck')));

    // Notifications
    const { push } = getContext();
    wrap.appendChild(el('span', 'th-label set-section', t('set.notifications')));
    const notifyCard = el('section', 'set-card');
    const toggle = el('button', 'set-toggle');
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(push.enabled));
    toggle.disabled = !push.supported;
    const text = el('span', 'mi-text');
    text.append(el('b', null, t('set.notifTitle')), el('small', null, t('set.notifText')));
    toggle.append(el('span', 'mi-icon', '🔔'), text, el('span', 'switch'));
    toggle.addEventListener('click', async () => {
      toggle.disabled = true;
      try {
        await togglePush(!push.enabled);
        pushNote = '';
      } catch (err) {
        pushNote = err.code === 'denied' ? 'set.notifDenied' : 'set.notifError';
      }
      render();
    });
    notifyCard.appendChild(toggle);
    const note = !push.supported ? push.reason : pushNote ? t(pushNote) : push.enabled && !getContext().teamName ? t('set.notifNoTeam') : '';
    if (note) notifyCard.appendChild(el('p', 'set-hint', note));
    wrap.appendChild(notifyCard);

    // Reset (each button needs a second tap to confirm)
    wrap.appendChild(el('span', 'th-label set-section', t('set.reset')));
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
          resetNote = 'set.resetError';
        }
        render();
      });
      resetCard.append(b, el('p', 'set-hint', hint));
    };
    danger('progress', t('set.resetProgress'), t('set.resetConfirm'),
      teamName ? t('set.resetHintTeam', { team: teamName }) : t('set.resetHint'),
      resetProgress, 'set.resetDone');
    danger('all', t('set.startOver'), t('set.startOverConfirm'), t('set.startOverHint'), startOver, '');
    if (resetNote) resetCard.appendChild(el('p', resetNote === 'set.resetError' ? 'team-error' : 'set-hint', t(resetNote)));
    wrap.appendChild(resetCard);

    root.replaceChildren(wrap);

    // Lightweight update while stepping (re-rendering would interrupt a held button).
    function refresh() {
      for (const chip of presets.children) chip.classList.toggle('on', Number(chip.textContent) === draft.goal);
      const now = JSON.stringify(draft) !== JSON.stringify(getContext().rules);
      saveBtn.disabled = !now || status === 'saving';
      saveBtn.textContent = t('set.save');
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
