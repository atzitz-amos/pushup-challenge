# Pushup Challenge

30 push-ups a day until Christmas, with at most two skipped days. A small phone web app: open it, add it to the home screen, scroll the wheel to today's total and save.

- Swipe left and right to see past and upcoming days; swipe up for the calendar.
- The menu (your initial, top right) has the calendar, your team and settings.
- Add `?demo` to the URL to try it with sample history and a pretend team (code `DEMO42`) with two teammates, stored separately from real data.

Rules and dates live in [`js/config.js`](js/config.js). Plain HTML, CSS and JavaScript, no build step.

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

## Testing on a phone over Wi-Fi

```
python dev-server.py
```

Then open `http://<your computer's IP>:5174` on the phone. This server disables caching, so a reload always shows the latest version.
