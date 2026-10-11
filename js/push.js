// Phone notifications when teammates save push-ups (Web Push). They need the app
// on https (GitHub Pages; on iPhone added to the Home Screen), a team, and the
// notify-team function set up in Supabase (see README).
import { DEMO, SUPABASE, PUSH } from './config.js';
import { rpc } from './store.js';

const PREF = 'pushups.notify';
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

// { supported, reason } — reason says why notifications can't be turned on here.
export function pushStatus() {
  if (DEMO || !SUPABASE.url || !PUSH.publicKey) {
    return { supported: false, reason: "Notifications aren't available in this version of the app." };
  }
  if (!window.isSecureContext) {
    return { supported: false, reason: 'Open the app from its https address (GitHub Pages) to use notifications.' };
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return {
      supported: false,
      reason: isIOS
        ? 'On iPhone, add the app to your Home Screen (Share → Add to Home Screen) and open it from there.'
        : "This browser doesn't support notifications.",
    };
  }
  if (Notification.permission === 'denied') {
    return { supported: false, reason: 'Notifications are blocked for this app. Allow them in your phone settings, then come back.' };
  }
  return { supported: true };
}

export function wantsPush() {
  try { return localStorage.getItem(PREF) === '1'; } catch { return false; }
}
function setWantsPush(on) {
  try { localStorage.setItem(PREF, on ? '1' : '0'); } catch { /* ignore */ }
}

function keyBytes(base64url) {
  const padded = base64url + '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscription(create) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && create) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH.publicKey) });
  }
  return sub;
}

// Asks for permission and turns notifications on (for the team, if in one).
// Throws an error with code 'denied' when the person doesn't allow them.
export async function enablePush(team, user) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw Object.assign(new Error('Notifications not allowed'), { code: 'denied' });
  setWantsPush(true);
  if (team) await registerPush(team, user);
}

// Tells the server which team this phone wants news from. Does nothing unless turned on.
export async function registerPush(team, user) {
  if (!team || !wantsPush() || !pushStatus().supported || Notification.permission !== 'granted') return;
  const sub = await subscription(true);
  await rpc('save_push_subscription', { p_code: team.code, p_name: user, p_subscription: sub.toJSON() });
}

// Leaving a team: stop that team's news but keep the preference for the next team.
export async function unregisterPush() {
  if (!pushStatus().supported) return;
  const sub = await subscription(false).catch(() => null);
  if (sub) await rpc('delete_push_subscription', { p_endpoint: sub.endpoint }).catch(() => {});
}

// Turns notifications off for this phone.
export async function disablePush() {
  setWantsPush(false);
  if (!pushStatus().supported) return;
  const sub = await subscription(false).catch(() => null);
  if (sub) {
    await rpc('delete_push_subscription', { p_endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}
