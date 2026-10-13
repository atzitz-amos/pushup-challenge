// Haptics, sounds, confetti, particles and number animations.
import { COLORS } from './config.js';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Haptics ---------- */
// Android: Vibration API. iOS Safari (18+) has no Vibration API, but toggling
// an <input type="checkbox" switch> produces a native haptic tick.
let hapticLabel;
export function haptic(ms = 8) {
  if (navigator.vibrate) {
    navigator.vibrate(ms);
    return;
  }
  if (!hapticLabel) {
    hapticLabel = document.createElement('label');
    hapticLabel.setAttribute('aria-hidden', 'true');
    hapticLabel.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    hapticLabel.appendChild(input);
    document.body.appendChild(hapticLabel);
  }
  hapticLabel.click();
}

/* ---------- Sound ---------- */
const MUTE_KEY = 'pushups.muted';
let ctx;

export function isMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
export function setMuted(m) {
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
}

// Browsers only allow audio after a user gesture.
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  ctx?.resume?.();
}

function tone(freq, t0, dur, { type = 'sine', gain = 0.08, to } = {}) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function sound(name, value = 0) {
  if (!ctx || isMuted()) return;
  const t = ctx.currentTime;
  switch (name) {
    case 'tick': // pitch climbs with the number
      tone(700 + value * 22, t, 0.045, { type: 'triangle', gain: 0.045 });
      break;
    case 'whoosh':
      tone(260, t, 0.35, { type: 'sine', gain: 0.05, to: 1100 });
      break;
    case 'save':
      tone(660, t, 0.18, { type: 'triangle' });
      tone(990, t + 0.09, 0.3, { type: 'triangle' });
      break;
    case 'ping': // a cheer arrived
      tone(880, t, 0.16, { type: 'sine', gain: 0.06 });
      tone(1320, t + 0.08, 0.28, { type: 'sine', gain: 0.05 });
      break;
    case 'complete':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, 0.45, { type: 'triangle', gain: 0.09 }));
      tone(1568, t + 0.5, 0.8, { gain: 0.05 });
      break;
  }
}

/* ---------- Numbers ---------- */
export function countUp(el, from, to, dur = 900) {
  if (reducedMotion() || from === to) {
    el.textContent = to;
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (k < 1) requestAnimationFrame(step);
    else bump(el);
  };
  requestAnimationFrame(step);
}

export function bump(el, cls = 'bump') {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/* ---------- Particles: button -> ring ---------- */
export function flyParticles(fromEl, toEl, count = 12) {
  if (reducedMotion()) return Promise.resolve();
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const tx = b.left + b.width / 2;
  const ty = b.top + b.height / 2;

  for (let i = 0; i < count; i++) {
    const sx = a.left + a.width * (0.2 + Math.random() * 0.6);
    const sy = a.top + a.height / 2;
    const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 260;
    const my = (sy + ty) / 2 + (Math.random() - 0.5) * 60;
    const size = 6 + Math.random() * 8;

    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `left:${sx}px;top:${sy}px;width:${size}px;height:${size}px;background:${COLORS[i % COLORS.length]};color:${COLORS[i % COLORS.length]}`;
    document.body.appendChild(p);

    const anim = p.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
        { transform: `translate(-50%,-50%) translate(${mx - sx}px,${my - sy}px) scale(1.2)`, opacity: 1, offset: 0.45 },
        { transform: `translate(-50%,-50%) translate(${tx - sx}px,${ty - sy}px) scale(.3)`, opacity: 0.3 },
      ],
      { duration: 560 + Math.random() * 180, delay: i * 22, easing: 'cubic-bezier(.45,0,.4,1)' },
    );
    anim.onfinish = () => p.remove();
  }
  return new Promise((r) => setTimeout(r, 600));
}

/* ---------- Confetti (canvas-confetti from CDN, optional) ---------- */
const confettiReady = () => typeof window.confetti === 'function';

export function burstAt(el) {
  if (!confettiReady()) return;
  const r = el.getBoundingClientRect();
  window.confetti({
    particleCount: 45,
    spread: 85,
    startVelocity: 26,
    scalar: 0.8,
    ticks: 110,
    origin: { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight },
    colors: COLORS,
    disableForReducedMotion: true,
  });
}

export function celebrateConfetti() {
  if (!confettiReady() || reducedMotion()) return;
  const end = Date.now() + 1800;
  (function frame() {
    window.confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors: COLORS });
    window.confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors: COLORS });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  setTimeout(() => {
    window.confetti({
      particleCount: 160,
      spread: 130,
      startVelocity: 45,
      origin: { y: 0.35 },
      colors: COLORS,
      shapes: ['star', 'circle', 'square'],
      scalar: 1.1,
    });
  }, 250);
}

/* ---------- Reaction effect ---------- */

// Like Discord's super reactions: Google's animated version of the emoji (Noto Emoji
// Animation, CC BY 4.0, copied into emoji/) pops out of the chip and plays, while copies
// of the emoji burst out with physics and sparks in its colours fly around (canvas-confetti,
// already loaded by the page). The animations and the Lottie player (from jsDelivr) are
// loaded once, when the chat opens; the service worker keeps them.
const REACTION_ASSETS = {
  '🔥': { code: '1f525', colors: ['#fb923c', '#f43f5e', '#fde047'] },
  '💪': { code: '1f4aa', colors: ['#fbbf24', '#34d399', '#38bdf8'] },
  '👏': { code: '1f44f', colors: ['#fde047', '#38bdf8', '#a78bfa'] },
  '😂': { code: '1f602', colors: ['#fde047', '#34d399', '#38bdf8'] },
  '❤️': { code: '2764_fe0f', colors: ['#f43f5e', '#f472b6', '#a78bfa'] },
};
const LOTTIE_URL = 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie_light.min.js';
const BIG_SIZE = 150; // px, the animated emoji
const PARTICLES = 14; // emoji copies in the burst

const emojiAnimations = {}; // emoji → Lottie data
let lottieReady = null;
export function preloadReactions() {
  if (lottieReady) return lottieReady;
  lottieReady = new Promise((resolve, reject) => {
    if (window.lottie) return resolve();
    const s = document.createElement('script');
    s.src = LOTTIE_URL;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  }).catch((err) => console.warn('Lottie not loaded:', err));
  for (const [emoji, { code }] of Object.entries(REACTION_ASSETS)) {
    fetch(`emoji/${code}.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.status))))
      .then((data) => { emojiAnimations[emoji] = data; })
      .catch((err) => console.warn(`Animated ${emoji} not loaded:`, err));
  }
  return lottieReady;
}

// One full-screen canvas for the confetti, above the chat.
let fire = null;
const emojiShapes = {};
function confettiCannon() {
  if (!fire && typeof window.confetti === 'function') {
    const canvas = document.createElement('canvas');
    canvas.className = 'reaction-fx';
    document.body.appendChild(canvas);
    fire = window.confetti.create(canvas, { resize: true, useWorker: true });
  }
  return fire;
}

// small: a lighter version (no big emoji, fewer particles), for teammates' reactions
// arriving while you watch.
export function reactionBurst(fromEl, emoji, { small = false } = {}) {
  if (reducedMotion() || !fromEl.isConnected) return;
  const r = fromEl.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  if (!small) haptic([12, 40, 18]);

  // 1. The big animated emoji pops out of the chip, plays, then floats away.
  if (!small) {
    const box = document.createElement('div');
    box.className = 'reaction-big';
    Object.assign(box.style, { left: `${x}px`, top: `${y - 6}px`, width: `${BIG_SIZE}px`, height: `${BIG_SIZE}px` });
    document.body.appendChild(box);
    if (window.lottie && emojiAnimations[emoji]) {
      window.lottie.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: true, animationData: emojiAnimations[emoji] });
    } else {
      box.textContent = emoji; // not loaded (yet): the plain emoji does the same move
      box.classList.add('plain');
    }
    const pop = box.animate([
      { transform: 'translate(-50%, -100%) translateY(40%) scale(.2)', opacity: 0 },
      { transform: 'translate(-50%, -100%) scale(1.08)', opacity: 1, offset: 0.18 },
      { transform: 'translate(-50%, -100%) scale(1)', opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%, -100%) scale(1)', opacity: 1, offset: 0.8 },
      { transform: 'translate(-50%, -100%) translateY(-30%) scale(.8)', opacity: 0 },
    ], { duration: 1900, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'both' });
    const done = () => box.remove();
    pop.finished.then(done, done);
    setTimeout(done, 2500); // whatever happens (e.g. the page went to the background)
  }

  // 2. Copies of the emoji burst out with physics, 3. sparks in its colours.
  const cannon = confettiCannon();
  if (!cannon) return;
  const origin = { x: x / innerWidth, y: y / innerHeight };
  emojiShapes[emoji] ||= window.confetti.shapeFromText({ text: emoji, scalar: 2 });
  const count = small ? 6 : PARTICLES;
  cannon({
    shapes: [emojiShapes[emoji]], scalar: small ? 1.4 : 1.8, particleCount: count,
    spread: 100, startVelocity: small ? 22 : 32, gravity: 0.9, decay: 0.92, ticks: 110, origin, flat: true,
  });
  cannon({
    colors: REACTION_ASSETS[emoji]?.colors || COLORS, particleCount: Math.round(count * 1.6), shapes: ['circle', 'square'],
    scalar: 0.7, spread: 360, startVelocity: small ? 16 : 22, gravity: 0.7, decay: 0.9, ticks: 90, origin,
  });
}
