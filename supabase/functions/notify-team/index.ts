// Supabase Edge Function: notifies a team when someone saves push-ups.
// It is called by a database webhook on INSERT into public.entries (see README),
// and sends a Web Push notification to every teammate's phone that turned
// notifications on, except the person who saved.
//
// Secrets (Edge Functions -> Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'https://atzitz-amos.github.io/pushup-challenge/',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

// Only fresh saves notify: history uploaded when someone joins a team, or saves
// made offline that reach the server much later, stay quiet.
const FRESH_MS = 15 * 60 * 1000;

function db(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

Deno.serve(async (req) => {
  const { type, record } = await req.json();
  if (type !== 'INSERT' || !record?.team_code) return new Response('ignored');
  if (Date.now() - Date.parse(record.created_at) > FRESH_MS) return new Response('not a fresh save');

  const code = encodeURIComponent(record.team_code);
  const name = encodeURIComponent(record.user_name);
  const [subs, teams, today] = await Promise.all([
    db(`push_subscriptions?team_code=eq.${code}&select=endpoint,user_name,p256dh,auth`).then((r) => r.json()),
    db(`teams?code=eq.${code}&select=name,goal`).then((r) => r.json()),
    db(`entries?team_code=eq.${code}&user_name=ilike.${name}&day=eq.${record.day}&select=count`).then((r) => r.json()),
  ]);

  const team = teams[0] ?? { name: 'Your team', goal: 30 };
  const total = today.reduce((sum: number, e: { count: number }) => sum + e.count, 0);
  const justFinished = total >= team.goal && total - record.count < team.goal;
  const payload = JSON.stringify({
    title: justFinished
      ? `${record.user_name} finished today's ${team.goal}! 🎉`
      : `${record.user_name} did ${record.count} push-ups 💪`,
    body: justFinished ? `${team.name} · your turn?` : `${Math.min(total, team.goal)}/${team.goal} today · ${team.name}`,
    tag: `${record.team_code}-${record.user_name.toLowerCase()}`, // newer news from the same person replaces older
    url: './#team',
  });

  const others = subs.filter((s: { user_name: string }) => s.user_name.toLowerCase() !== record.user_name.toLowerCase());
  await Promise.all(others.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // The phone unsubscribed or the subscription expired: forget it.
        await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' });
      } else {
        console.error('Push failed', status, err);
      }
    }
  }));
  return new Response(`notified ${others.length}`);
});
