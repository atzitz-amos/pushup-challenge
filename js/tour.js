// A short guided tour: a spotlight glides from one part of the screen to the next,
// with a card explaining it. Tap anywhere (or Next) to continue, Skip to stop.
//
// Each step: { target: () => element or null, title, text, emoji, shape: 'round',
// gesture: 'swipe-x' | 'swipe-up' }. Without a target the whole screen dims and the
// card sits in the middle (for gestures that work anywhere).
import { t } from './i18n.js';

const PAD = 10; // room around the highlighted element

export function startTour(steps, { onEnd } = {}) {
  const root = document.createElement('div');
  root.className = 'tour';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="tour-spot"></div>
    <div class="tour-hand" aria-hidden="true">👆</div>
    <div class="tour-card" aria-live="polite">
      <div class="tour-emoji"></div>
      <h2 class="tour-title"></h2>
      <p class="tour-text"></p>
      <div class="tour-foot">
        <button class="tour-skip" type="button"></button>
        <div class="tour-dots" aria-hidden="true">${steps.map(() => '<i></i>').join('')}</div>
        <button class="tour-next" type="button"></button>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const spot = $('.tour-spot');
  const hand = $('.tour-hand');
  const card = $('.tour-card');
  const dots = [...root.querySelectorAll('.tour-dots i')];
  $('.tour-skip').textContent = t('tour.skip');

  let index = -1;
  let ended = false;

  function place() {
    const step = steps[index];
    const el = step.target?.();
    const vw = innerWidth;
    const vh = innerHeight;
    let r;
    if (el) {
      const b = el.getBoundingClientRect();
      const pad = step.pad ?? PAD;
      r = { left: b.left - pad, top: b.top - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
      if (step.shape === 'round') {
        const size = Math.max(r.width, r.height);
        r = { left: r.left + (r.width - size) / 2, top: r.top + (r.height - size) / 2, width: size, height: size };
      }
    } else {
      // Nothing to highlight: the spot shrinks to nothing, so the whole screen is dimmed.
      r = { left: vw / 2, top: vh * 0.75, width: 0, height: 0 };
    }
    Object.assign(spot.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      borderRadius: step.shape === 'round' ? '50%' : `${step.radius ?? 26}px`,
    });
    spot.classList.toggle('empty', !el);

    // The card goes on the side with more room (or in the middle without a target).
    card.style.top = card.style.bottom = '';
    if (!el) {
      card.style.top = `${Math.max(16, vh * 0.3)}px`;
    } else if (vh - (r.top + r.height) >= r.top) {
      card.style.top = `${Math.min(r.top + r.height + 14, vh - card.offsetHeight - 16)}px`;
    } else {
      card.style.bottom = `${Math.min(vh - r.top + 14, vh - card.offsetHeight - 16)}px`;
    }

    // Gesture hint: a finger miming the swipe, over the target (or low on the screen).
    hand.className = `tour-hand ${step.gesture ?? ''}`;
    hand.hidden = !step.gesture;
    hand.style.left = `${r.left + r.width / 2}px`;
    hand.style.top = `${el ? r.top + r.height / 2 : vh * 0.72}px`;
  }

  function go(next) {
    if (next >= steps.length) return end();
    index = next;
    const step = steps[index];
    $('.tour-emoji').textContent = step.emoji ?? '';
    $('.tour-title').textContent = step.title;
    $('.tour-text').textContent = step.text;
    $('.tour-next').textContent = index === steps.length - 1 ? t('tour.done') : t('tour.next');
    dots.forEach((d, i) => d.classList.toggle('on', i === index));
    // Swap the text with a little lift, while the spotlight glides to its new place.
    card.classList.remove('swap');
    void card.offsetWidth;
    card.classList.add('swap');
    place();
  }

  function end() {
    if (ended) return;
    ended = true;
    removeEventListener('resize', onResize);
    root.classList.remove('show');
    setTimeout(() => root.remove(), 350);
    onEnd?.();
  }

  const onResize = () => place();
  addEventListener('resize', onResize);

  // Tap anywhere moves on; Skip ends it. The tour swallows every touch, so nothing
  // underneath (swipes, the wheel) reacts while it is showing.
  root.addEventListener('click', (e) => {
    if (e.target.closest('.tour-skip')) end();
    else go(index + 1);
  });

  document.body.append(root);
  go(0);
  void root.offsetWidth;
  root.classList.add('show');
  $('.tour-next').focus({ preventScroll: true });
  return { end };
}
