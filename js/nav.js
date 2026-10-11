// The menu sheet and the full-screen panels opened from it.
// Panels are addressed by the URL hash (#calendar), so the phone's back gesture
// closes them and a link (or a future widget) can open one directly.

const panels = {};
let pushed = false; // did we add the hash ourselves (so closing can go back)?

export function registerPanel(id, { el, render, onOpen }) {
  panels[id] = { el, render, onOpen };
  el.querySelector('.panel-close')?.addEventListener('click', closePanel);
}

export function openPanel(id) {
  if (location.hash === `#${id}`) return sync();
  pushed = true;
  location.hash = id;
}

export function closePanel() {
  if (pushed) {
    pushed = false;
    history.back();
  } else {
    history.replaceState(null, '', location.pathname + location.search);
    sync();
  }
}

export async function sync() {
  const id = location.hash.slice(1);
  for (const [key, p] of Object.entries(panels)) {
    const open = key === id;
    if (open && p.el.hidden) {
      await p.render?.();
      p.el.hidden = false;
      void p.el.offsetWidth; // start the slide-in from the hidden position
      p.el.classList.add('open');
      p.onOpen?.();
    } else if (!open && !p.el.hidden) {
      p.el.classList.remove('open');
      setTimeout(() => {
        if (!p.el.classList.contains('open')) p.el.hidden = true;
      }, 400);
    }
  }
}

addEventListener('hashchange', () => {
  if (!location.hash) pushed = false;
  sync();
});

// Bottom sheet: slides up over a dimmed backdrop; tap the backdrop to close.
export function createSheet(root) {
  const sheet = {
    open() {
      root.hidden = false;
      void root.offsetWidth;
      root.classList.add('open');
    },
    close() {
      root.classList.remove('open');
      setTimeout(() => {
        if (!root.classList.contains('open')) root.hidden = true;
      }, 350);
    },
  };
  root.addEventListener('click', (e) => {
    if (e.target === root) sheet.close();
  });
  return sheet;
}
