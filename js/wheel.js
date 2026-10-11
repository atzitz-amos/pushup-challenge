// iOS-style 3D number picker built on native scroll + scroll-snap, so it gets
// real momentum scrolling on phones. Items are transformed every frame
// depending on their distance from the center to look like a rotating drum.

export class Wheel {
  // Row height comes from the CSS variable --item-h, so it can change with screen size.
  constructor(root, { onChange } = {}) {
    this.root = root;
    this.h = 64;
    this.onChange = onChange;
    this.items = [];
    this.min = 0;
    this.value = null;

    this.scroller = document.createElement('div');
    this.scroller.className = 'wheel-scroller';
    this.list = document.createElement('div');
    this.list.className = 'wheel-list';
    this.scroller.appendChild(this.list);
    root.appendChild(this.scroller);

    this.scroller.addEventListener('scroll', () => this.schedule(), { passive: true });
    this.scroller.addEventListener('click', (e) => {
      const item = e.target.closest('.wheel-item');
      if (item) this.scrollToValue(Number(item.dataset.v), true);
    });
    new ResizeObserver(() => this.layout()).observe(root);
  }

  setRange(min, max, value = min) {
    this.min = min;
    this.list.replaceChildren();
    this.items = [];
    for (let v = min; v <= max; v++) {
      const el = document.createElement('div');
      el.className = 'wheel-item';
      el.dataset.v = v;
      el.textContent = v;
      this.list.appendChild(el);
      this.items.push(el);
    }
    this.value = null;
    this.silent = true;
    this.layout();
    this.scrollToValue(value, false);
    this.update();
    this.silent = false;
  }

  layout() {
    const h = parseFloat(getComputedStyle(this.root).getPropertyValue('--item-h')) || this.h;
    const viewH = this.scroller.clientHeight;
    const pad = Math.max(0, (viewH - h) / 2);
    this.list.style.paddingTop = this.list.style.paddingBottom = `${pad}px`;
    if (h !== this.h) {
      // Row size changed (screen resized): stay on the same number.
      this.h = h;
      if (this.value !== null) {
        const silent = this.silent;
        this.silent = true;
        this.scrollToValue(this.value, false);
        this.silent = silent;
      }
    }
    this.update();
  }

  scrollToValue(v, smooth) {
    const top = (v - this.min) * this.h;
    if (smooth) this.scroller.scrollTo({ top, behavior: 'smooth' });
    else this.scroller.scrollTop = top;
  }

  schedule() {
    if (!this.raf) {
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.update();
      });
    }
  }

  update() {
    if (!this.items.length) return;
    const pos = this.scroller.scrollTop / this.h;
    for (let i = 0; i < this.items.length; i++) {
      const d = i - pos;
      const a = Math.min(Math.abs(d), 4);
      const el = this.items[i];
      el.style.transform = `perspective(420px) rotateX(${-d * 24}deg) scale(${1 - a * 0.1})`;
      el.style.opacity = Math.max(0.06, 1 - a * 0.32);
      el.classList.toggle('active', Math.abs(d) < 0.5);
    }
    const idx = Math.min(this.items.length - 1, Math.max(0, Math.round(pos)));
    const v = this.min + idx;
    if (v !== this.value) {
      const fromUser = this.value !== null && !this.silent;
      this.value = v;
      this.onChange?.(v, { fromUser });
    }
  }
}
