// Vertical swipe detection with an axis lock: the first ~10px of movement decide
// whether a touch is vertical, so horizontal swipes (days, months) keep working.
// onEnd gets the total offset and the release velocity (px/ms, + is downward).

export function onVerticalSwipe(target, { canStart, onMove, onEnd }) {
  let x0 = 0;
  let y0 = 0;
  let lastY = 0;
  let lastT = 0;
  let vy = 0;
  let axis = null;
  let active = false;

  target.addEventListener('touchstart', (e) => {
    active = e.touches.length === 1 && canStart(e);
    if (!active) return;
    axis = null;
    vy = 0;
    x0 = e.touches[0].clientX;
    y0 = lastY = e.touches[0].clientY;
    lastT = e.timeStamp;
  }, { passive: true });

  target.addEventListener('touchmove', (e) => {
    if (!active) return;
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    if (!axis) {
      if (Math.hypot(x - x0, y - y0) < 10) return;
      axis = Math.abs(y - y0) > Math.abs(x - x0) * 1.3 ? 'y' : 'x';
    }
    if (axis !== 'y') return;
    const dt = Math.max(1, e.timeStamp - lastT);
    vy = 0.6 * ((y - lastY) / dt) + 0.4 * vy; // smoothed velocity
    lastY = y;
    lastT = e.timeStamp;
    onMove(y - y0);
  }, { passive: true });

  const end = (cancelled) => {
    if (active && axis === 'y') onEnd(cancelled, { dy: lastY - y0, vy });
    active = false;
  };
  target.addEventListener('touchend', () => end(false));
  target.addEventListener('touchcancel', () => end(true));
}
