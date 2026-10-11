// Vertical swipe detection with an axis lock: the first ~10px of movement decide
// whether a touch is vertical, so horizontal swipes (days, months) keep working.

export function onVerticalSwipe(target, { canStart, onMove, onEnd }) {
  let x0 = 0;
  let y0 = 0;
  let axis = null;
  let active = false;

  target.addEventListener('touchstart', (e) => {
    active = e.touches.length === 1 && canStart(e);
    if (!active) return;
    axis = null;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });

  target.addEventListener('touchmove', (e) => {
    if (!active) return;
    const dx = e.touches[0].clientX - x0;
    const dy = e.touches[0].clientY - y0;
    if (!axis) {
      if (Math.hypot(dx, dy) < 10) return;
      axis = Math.abs(dy) > Math.abs(dx) * 1.3 ? 'y' : 'x';
    }
    if (axis === 'y') onMove(dy);
  }, { passive: true });

  const end = (cancelled) => {
    if (active && axis === 'y') onEnd(cancelled);
    active = false;
  };
  target.addEventListener('touchend', () => end(false));
  target.addEventListener('touchcancel', () => end(true));
}
