// The menu sheet and the full-screen panels opened from it.
// Panels are addressed by the URL hash (#calendar), so the phone's back gesture
// closes them and a link (or a future widget) can open one directly.

const panels = {};
let pushed = false; // did we add the hash ourselves (so closing can go back)?

export function registerPanel(id, { el, render, onOpen, onClose }) {
  panels[id] = { el, render, onOpen, onClose };
  el.querySelector('.panel-close')?.addEventListener('click', closePanel);
}

const isShown = (p) => p.el.classList.contains('open');

// Renders the panel and makes it visible but not yet open (for an interactive drag).
export async function preparePanel(id) {
  const p = panels[id];
  if (p.el.hidden) {
    await p.render?.();
    p.el.hidden = false;
  }
}

// Hides a prepared panel again once its closing transition is done, unless it opened.
export function settlePanel(id) {
  const p = panels[id];
  setTimeout(() => {
    if (!isShown(p)) p.el.hidden = true;
  }, 350);
}

async function show(p) {
  if (p.el.hidden) {
    await p.render?.();
    p.el.hidden = false;
    void p.el.offsetWidth; // start the slide-in from the hidden position
  }
  // When already visible (after a drag) this runs synchronously, so the panel
  // animates on from wherever the finger left it.
  p.el.classList.add('open');
  p.onOpen?.();
}

function hide(p) {
  p.el.classList.remove('open');
  p.onClose?.();
  settlePanel(Object.keys(panels).find((k) => panels[k] === p));
}

export function openPanel(id) {
  const p = panels[id];
  if (!isShown(p)) show(p);
  if (location.hash !== `#${id}`) {
    pushed = true;
    location.hash = id;
  }
}

export function closePanel() {
  for (const p of Object.values(panels)) if (isShown(p)) hide(p);
  if (!location.hash) return;
  if (pushed) {
    pushed = false;
    history.back();
  } else {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

// Brings the panels in line with the URL (deep links, the back gesture).
export async function sync() {
  const id = location.hash.slice(1);
  for (const [key, p] of Object.entries(panels)) {
    if (key === id && !isShown(p)) await show(p);
    else if (key !== id && isShown(p)) hide(p);
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
