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
  const userParam = encodeURIComponent(record.user_name);
  const [subs, teams, today] = await Promise.all([
    db(`push_subscriptions?team_code=eq.${code}&select=endpoint,user_name,p256dh,auth,lang`).then((r) => r.json()),
    db(`teams?code=eq.${code}&select=name,goal`).then((r) => r.json()),
    db(`entries?team_code=eq.${code}&user_name=ilike.${userParam}&day=eq.${record.day}&select=count`).then((r) => r.json()),
  ]);

  const team = teams[0] ?? { name: 'Your team', goal: 30 };
  const total = today.reduce((sum: number, e: { count: number }) => sum + e.count, 0);
  const justFinished = total >= team.goal && total - record.count < team.goal;
  // The title is short (Android cuts long titles); the news itself goes in the body,
  // in each phone's language.
  const name = record.user_name;
  const done = Math.min(total, team.goal);
  const bodies: Record<string, string> = justFinished
    ? {
      en: `${name} finished all ${team.goal} push-ups today! 🎉`,
      fr: `${name} a terminé ses ${team.goal} pompes du jour ! 🎉`,
    }
    : {
      en: `${name} finished ${record.count} push-ups · ${done}/${team.goal} today`,
      fr: `${name} a fait ${record.count} pompes · ${done}/${team.goal} aujourd'hui`,
    };
  const payload = (lang: string) => JSON.stringify({
    title: `💪 ${team.name}`,
    body: bodies[lang] ?? bodies.en,
    tag: `${record.team_code}-${name.toLowerCase()}`, // newer news from the same person replaces older
    url: './#chat', // where the "finished" card is, to react to
  });

  const others = subs.filter((s: { user_name: string }) => s.user_name.toLowerCase() !== name.toLowerCase());
  await Promise.all(others.map(async (s: { endpoint: string; p256dh: string; auth: string; lang?: string }) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload(s.lang ?? 'en'), { TTL: 3600 });
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
