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

/* ---------- Reaction burst ---------- */

// Colours that go with each reaction's emoji.
const BURST_COLORS = {
  '🔥': ['#fb923c', '#f43f5e', '#fde047'],
  '💪': ['#fbbf24', '#34d399', '#38bdf8'],
  '👏': ['#fde047', '#38bdf8', '#a78bfa'],
  '😂': ['#fde047', '#34d399', '#38bdf8'],
  '❤️': ['#f43f5e', '#f472b6', '#a78bfa'],
};

// Like Discord's super reactions: the emoji bursts out of the chip. A big copy rises
// and fades, a ring expands, and particles (small copies and sparks) fly out and fall.
// small: a lighter version, for teammates' reactions arriving while you watch.
export function reactionBurst(fromEl, emoji, { small = false } = {}) {
  if (reducedMotion() || !fromEl.isConnected) return;
  const r = fromEl.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'burst';
  layer.style.left = `${r.left + r.width / 2}px`;
  layer.style.top = `${r.top + r.height / 2}px`;
  document.body.appendChild(layer);
  const colors = BURST_COLORS[emoji] || COLORS;
  const add = (cls, text) => {
    const e = document.createElement('span');
    e.className = cls;
    if (text) e.textContent = text;
    layer.appendChild(e);
    return e;
  };
  const center = 'translate(-50%, -50%)';
  const anims = [];

  if (!small) {
    const big = add('burst-big', emoji);
    anims.push(big.animate([
      { transform: `${center} scale(.6)`, opacity: 1 },
      { transform: 'translate(-50%, -150%) scale(3.2)', opacity: 1, offset: 0.4 },
      { transform: 'translate(-50%, -175%) scale(3.4)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%, -200%) scale(2.6)', opacity: 0 },
    ], { duration: 1000, easing: 'cubic-bezier(.2, .8, .2, 1)' }));
  }

  const ring = add('burst-ring');
  ring.style.borderColor = colors[0];
  anims.push(ring.animate([
    { transform: `${center} scale(.3)`, opacity: 0.9 },
    { transform: `${center} scale(${small ? 2.2 : 3.4})`, opacity: 0 },
  ], { duration: small ? 450 : 600, easing: 'cubic-bezier(.2, .8, .2, 1)' }));

  const n = small ? 8 : 20;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const dist = (small ? 28 : 55) + Math.random() * (small ? 30 : 75);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const kind = i % 4 === 0 ? 'emoji' : i % 2 ? 'dot' : 'spark';
    const p = add(`burst-${kind}`, kind === 'emoji' ? emoji : '');
    if (kind !== 'emoji') p.style.background = colors[i % colors.length];
    const spin = kind === 'spark' ? ` rotate(${(angle * 180) / Math.PI + 90}deg)` : '';
    const dur = 650 + Math.random() * 450;
    anims.push(p.animate([
      { transform: `${center} translate(0, 0) scale(0)${spin}`, opacity: 1 },
      { transform: `${center} translate(${dx * 0.75}px, ${dy * 0.75}px) scale(1.15)${spin}`, opacity: 1, offset: 0.35 },
      { transform: `${center} translate(${dx}px, ${dy + 34}px) scale(.35)${spin}`, opacity: 0 }, // falls a little
    ], { duration: dur, easing: 'cubic-bezier(.15, .7, .3, 1)', delay: Math.random() * 60 }));
  }

  const done = () => layer.remove();
  Promise.all(anims.map((a) => a.finished)).then(done, done);
  setTimeout(done, 1600); // whatever happens (e.g. the page went to the background)
}
