// Animated SVG progress ring with a faint "preview" arc for the wheel selection.

const R = 88;
const CIRC = 2 * Math.PI * R;

export function createRing(root) {
  const progress = root.querySelector('.ring-progress');
  const preview = root.querySelector('.ring-preview');
  for (const c of [progress, preview]) {
    c.style.strokeDasharray = CIRC;
    c.style.strokeDashoffset = CIRC;
  }

  const setArc = (c, p) => {
    p = Math.max(0, Math.min(1, p));
    c.style.strokeDashoffset = CIRC * (1 - p);
    c.style.opacity = p > 0 ? 1 : 0; // hide the round-cap dot at 0
  };

  return {
    set: (p) => setArc(progress, p),
    preview: (p) => setArc(preview, p),
    pulse() {
      root.classList.remove('pulse');
      void root.offsetWidth;
      root.classList.add('pulse');
    },
    complete: (on) => root.classList.toggle('complete', on),
  };
}
