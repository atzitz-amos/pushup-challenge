// Supabase Edge Function: notifies about the team chat and reactions ("cheers").
// It is called by a database webhook on INSERT into public.cheers (see README):
// - a chat message (owner '#team') notifies everyone in the team;
// - a reaction notifies the person whose day it is;
// - a comment on a day (older app versions) notifies that person and the others who commented there.
// Never the author themselves.
//
// Uses the same secrets as notify-team: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.

import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'https://atzitz-amos.github.io/pushup-challenge/',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

// Cheers that reach the server much later (sent offline) stay quiet.
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

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const TEAM_CHAT = '#team';
const short = (text: string) => (text.length > 120 ? `${text.slice(0, 119)}…` : text);

Deno.serve(async (req) => {
  const { type, record } = await req.json();
  if (type !== 'INSERT' || !record?.team_code) return new Response('ignored');
  if (Date.now() - Date.parse(record.created_at) > FRESH_MS) return new Response('not fresh');

  const code = encodeURIComponent(record.team_code);
  const ownerParam = encodeURIComponent(record.owner);
  const [subs, teams, entries, comments] = await Promise.all([
    db(`push_subscriptions?team_code=eq.${code}&select=endpoint,user_name,p256dh,auth,lang`).then((r) => r.json()),
    db(`teams?code=eq.${code}&select=name`).then((r) => r.json()),
    db(`entries?team_code=eq.${code}&user_name=ilike.${ownerParam}&day=eq.${record.day}&select=count`).then((r) => r.json()),
    record.body && record.owner !== TEAM_CHAT
      ? db(`cheers?team_code=eq.${code}&owner=ilike.${ownerParam}&day=eq.${record.day}&body=not.is.null&select=author`).then((r) => r.json())
      : Promise.resolve([]),
  ]);

  const team = teams[0] ?? { name: 'Your team' };
  const total = entries.reduce((sum: number, e: { count: number }) => sum + e.count, 0);
  const { author, owner } = record;
  const chat = record.body && owner === TEAM_CHAT;

  // Who hears about it: for a chat message everyone; otherwise the owner of the day,
  // plus (for comments on a day) everyone who commented there.
  const recipients = chat
    ? subs.map((s: { user_name: string }) => s.user_name).filter((name: string) => !same(name, author))
    : [owner, ...comments.map((c: { author: string }) => c.author)]
      .filter((name, i, all) => !same(name, author) && all.findIndex((n) => same(n, name)) === i);

  // The text depends on whether it is your day or someone else's, and on the language.
  const body = (forOwner: boolean, lang: string) => {
    const fr = lang === 'fr';
    if (record.emoji) {
      if (!total) return fr ? `${author} a réagi ${record.emoji} à ta journée` : `${author} reacted ${record.emoji} to your day`;
      return fr ? `${author} a réagi ${record.emoji} à tes ${total} pompes` : `${author} reacted ${record.emoji} to your ${total} push-ups`;
    }
    if (chat) return `${author}: ${short(record.body)}`;
    const said = `« ${short(record.body)} »`;
    if (forOwner) return fr ? `${author} sur ta journée : ${said}` : `${author} on your day: "${short(record.body)}"`;
    return fr ? `${author} sur la journée de ${owner} : ${said}` : `${author} on ${owner}'s day: "${short(record.body)}"`;
  };

  const targets = subs.filter((s: { user_name: string }) => recipients.some((n) => same(n, s.user_name)));
  await Promise.all(targets.map(async (s: { endpoint: string; p256dh: string; auth: string; user_name: string; lang?: string }) => {
    const payload = JSON.stringify({
      title: `💬 ${team.name}`,
      body: body(same(s.user_name, owner), s.lang ?? 'en'),
      tag: `cheer-${record.id}`, // every reaction and comment is its own notification
      url: './#chat',
    });
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
  return new Response(`notified ${targets.length}`);
});
