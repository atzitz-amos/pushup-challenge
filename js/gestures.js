// Swipe detection with an axis lock: the first ~10px of movement decide whether a
// touch is vertical or horizontal, using the same rule for every handler, so a
// single touch is only ever handled as one of the two.
// onMove gets the offset along the axis; onEnd gets the total offset and the
// release velocity (px/ms; + is down / right).

function lockAxis(dx, dy) {
  return Math.abs(dy) > Math.abs(dx) * 1.3 ? 'y' : 'x';
}

function onSwipe(target, want, { canStart, onStart, onMove, onEnd }) {
  let x0 = 0;
  let y0 = 0;
  let last = 0;
  let lastT = 0;
  let v = 0;
  let axis = null;
  let active = false;

  target.addEventListener('touchstart', (e) => {
    active = e.touches.length === 1 && canStart(e);
    if (!active) return;
    axis = null;
    v = 0;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    lastT = e.timeStamp;
  }, { passive: true });

  target.addEventListener('touchmove', (e) => {
    if (!active) return;
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    if (!axis) {
      if (Math.hypot(x - x0, y - y0) < 10) return;
      axis = lockAxis(x - x0, y - y0);
      if (axis !== want) return;
      last = want === 'y' ? y0 : x0;
      onStart?.();
    }
    if (axis !== want) return;
    const p = want === 'y' ? y : x;
    const dt = Math.max(1, e.timeStamp - lastT);
    v = 0.6 * ((p - last) / dt) + 0.4 * v; // smoothed velocity
    last = p;
    lastT = e.timeStamp;
    onMove(p - (want === 'y' ? y0 : x0));
  }, { passive: true });

  const end = (cancelled) => {
    if (active && axis === want) onEnd(cancelled, { d: last - (want === 'y' ? y0 : x0), v });
    active = false;
  };
  target.addEventListener('touchend', () => end(false));
  target.addEventListener('touchcancel', () => end(true));
}

export function onVerticalSwipe(target, opts) {
  onSwipe(target, 'y', {
    ...opts,
    onEnd: (cancelled, { d, v }) => opts.onEnd(cancelled, { dy: d, vy: v }),
  });
}

export function onHorizontalSwipe(target, opts) {
  onSwipe(target, 'x', {
    ...opts,
    onEnd: (cancelled, { d, v }) => opts.onEnd(cancelled, { dx: d, vx: v }),
  });
}
