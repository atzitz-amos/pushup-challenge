# Pushup Challenge

30 push-ups a day until Christmas, with at most two skipped days. A small phone web app: open it, add it to the home screen, scroll the wheel to today's total and save.

- Swipe left and right to see past and upcoming days; swipe up for the calendar.
- The menu (your initial, top right) has the calendar, your team and the settings.
- **Settings** change the daily goal, the skips allowed and the last day. In a team these are the team's rules: changes apply to everyone.
- Add `?demo` to the URL to try it with sample history and a pretend team (code `DEMO42`) with two teammates, stored separately from real data.

Default rules and dates live in [`js/config.js`](js/config.js). Plain HTML, CSS and JavaScript, no build step.

## Teams (Supabase)

Open **menu → Team** to create a team or join one with its 6-character code. **Share** sends a link with the code built in (`…?team=CODE`), which opens the join screen with the code filled in. Your history comes along when you join, and each team only sees its own members.

Within a team, people are identified by their name: use the same name on every device to keep your progress together. Entries are saved on the phone first and uploaded in the background, so the app also works offline.

### Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project, open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and run it. Run it again after updating the app; it upgrades older setups.
3. Copy the **Project URL** and a public key. The **Connect** button at the top of the dashboard shows both.
   - The URL is `https://<project-id>.supabase.co`; the project id is the last part of the dashboard address (`supabase.com/dashboard/project/<project-id>`).
   - The key is under **Project Settings → API Keys**: the **Publishable key** (`sb_publishable_…`) or the legacy **anon public** key (`eyJ…`). Never use the secret / service_role key.
4. Paste both into `SUPABASE` in [`js/config.js`](js/config.js), then commit and push.

The public key is meant to be public. The app can't read the tables directly: it goes through database functions that all need a team code, so a team's data is only reachable by people who know its code. Entries can only be removed within a day of saving them (for Undo).

## Notifications

When someone in your team saves push-ups, teammates get a phone notification ("Lea finished 15 push-ups · 15/30 today", or "Lea finished all 30 push-ups today! 🎉"). Turn them on in **Settings** or from the offer on the Team page. They need the app on https (GitHub Pages); on iPhone the app must be added to the Home Screen (iOS 16.4+). While the app is open, teammates' new push-ups also show up as a short message.

### Setup (once)

1. Run [`supabase/schema.sql`](supabase/schema.sql) again (it adds the `push_subscriptions` table).
2. **Edge Functions → Deploy a new function → Via Editor**: name it `notify-team`, paste [`supabase/functions/notify-team/index.ts`](supabase/functions/notify-team/index.ts) and deploy.
3. **Edge Functions → Secrets**: add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. Their values are in `supabase/vapid-keys.local.txt` (kept out of git; delete it once copied). The public key must match `PUSH.publicKey` in [`js/config.js`](js/config.js).
4. **Integrations → Database Webhooks** (click **Enable webhooks** the first time) **→ Create a new hook**: table `entries`, event **Insert**, type **Supabase Edge Functions**, function `notify-team`, and under HTTP headers click **Add auth header with service key**.

Only fresh saves notify: history uploaded when someone joins a team, or saves that reach the server much later, stay quiet.

## Team chat and cheers

Swiping up opens the **team chat**: messages, and a card each time someone reaches the daily goal ("🎉 Lea did all 30 push-ups!") that teammates react to (🔥 💪 👏 😂 ❤️). The reactions you got also show as a small pill on your day cards. A chat message notifies everyone in the team; a reaction notifies the person who finished. While the app is open, new ones drop in as a banner at the top.

Reacting plays Google's animated emoji ([Noto Emoji Animation](https://googlefonts.github.io/noto-emoji-animation/), CC BY 4.0, copied into [`emoji/`](emoji/)) with a burst of emoji confetti.

While it is being tried out, it is off unless a phone opens the app once with `?cheers` (`?cheers=0` turns it off again); swiping up then still opens the calendar. Demo mode always has it.

### Setup (once)

1. Run [`supabase/cheers.sql`](supabase/cheers.sql) in the SQL editor. It only adds a table and functions, so the app people use now is not affected. (A new project gets the same from `schema.sql`.)
2. **Edge Functions → Deploy a new function → Via Editor**: name it `notify-cheer`, paste [`supabase/functions/notify-cheer/index.ts`](supabase/functions/notify-cheer/index.ts) and deploy. It uses the same secrets as `notify-team`.
3. **Integrations → Database Webhooks → Create a new hook**: table `cheers`, event **Insert**, type **Supabase Edge Functions**, function `notify-cheer`, and under HTTP headers click **Add auth header with service key**.

## Testing on a phone over Wi-Fi

```
python dev-server.py
```

Then open `http://<your computer's IP>:5174` on the phone. This server disables caching, so a reload always shows the latest version.
