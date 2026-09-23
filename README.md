# Office Walkathon Portal

A 100-day office walking league: four teams of five, daily step points, weekly
head-to-head fixtures, a league table, monthly cups, a Final Sprint, individual awards,
badges and optional weekly challenges. Anyone can follow along without signing in; admins
enter steps and everything else updates automatically.

## Setup

The app runs on **Vercel** with **Supabase** for the database and sign-in. Both free tiers
are plenty for a 20-person office league. You need Node.js 22.6+ for local development.

### 1. Create the Supabase project

1. At [supabase.com](https://supabase.com), create a project. Pick the region closest to
   your office (for India, *Mumbai*).
2. Open **SQL Editor** and run each file in `supabase/migrations/` in order: paste the whole
   file, click **Run** (choose "Run without RLS" if asked; the files switch RLS on
   themselves), then the next. (With the Supabase CLI, `supabase db push` does the same.)
3. Go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign
   up". Only people an admin adds should get in. (Row-level security already hides
   everything from anyone without an active profile, but there's no reason to allow sign-ups.)
4. From **Project Settings → API**, copy the project URL, the anon (publishable) key and the
   service_role (secret) key.

### 2. Run it locally

```bash
cp .env.example .env.local   # then fill in the three Supabase values
npm install
npm run check                # confirms the keys and database are set up
npm run seed:demo            # optional: sample season; the demo admin's password is walk2026
npm run dev
```

For a real season instead of demo data, set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_NAME`
in `.env.local` and run `npm run setup`. It creates your admin account and an empty season
with four placeholder teams starting next Monday. Then sign in, open **Admin**, set the
dates, add the teams, then **Admin → Fixtures & challenges → Regenerate schedule** to build
the fixtures for them, add the 20 members and choose each team's captain. To add another
admin, use **Make admin** on their row; they get a temporary password to change under **Account**.

### 3. Deploy to Vercel

1. In Vercel, **Add New → Project** and import the GitHub repo. The defaults (Next.js) are right.
2. Add the environment variables from `.env.example` (at least the three Supabase values
   and `ALLOWED_EMAIL_DOMAIN`). Installing the Supabase integration from the Vercel
   Marketplace fills in the Supabase ones automatically.
3. Deploy. Every push to `main` redeploys.

Set `DEMO_MODE=true` only while you're trying things out with demo data. It shows a one-click
demo admin sign-in and a **Reset demo data** button.

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Scoring-engine tests (bands, fixtures, standings, leave, streaks, awards, team moves) |
| `npm run test:db` | Database security tests: runs the migration in an in-memory Postgres and checks who can read and write what |
| `npm run setup` | First-time admin account and empty season |
| `npm run seed:demo` | Replace everything with demo data (asks first) |
| `npm run check` | Check `.env.local` points at a set-up Supabase project |
| `npm run backup` | Save every table to `backups/<timestamp>.json` |

## How it's built

- **Next.js 16 (App Router) + React 19 + Tailwind CSS 4** on Vercel. Server components render
  every page; changes go through server actions.
- **Supabase Auth** for admin sign-in (email and password, no self sign-up).
  `ALLOWED_EMAIL_DOMAIN` limits admin sign-in to your company's addresses.
- **Supabase Postgres with row-level security does the authorisation.** Visitors read
  through the public (anon) role and admins act as themselves, so the database enforces:
  - anyone can read the competition, but never email addresses or the audit log;
  - only active admins can write anything: steps and leave (never future dates), settings,
    teams, members, fixtures and challenges;
  - the audit log can't be written to directly.
  Multi-step changes (saving a day, moving a member, rebuilding fixtures) are Postgres
  functions, so they happen in one transaction.
- **The service-role key** is used on the server only, for three things: creating and updating
  sign-in accounts, writing the computed results tables, and seeding demo data.
- **One scoring engine** (`src/lib/engine/engine.ts`), pure and unit-tested. Pages compute
  daily scores, fixtures, standings, trophies, awards, badges, challenges and insights from the
  raw entries on every request, so a correction updates everything it touches, including past
  weeks. After each change the results are also stored in `fixture_results`,
  `league_standings`, `weekly_awards`, `monthly_cups` and `user_badges` for reporting.
- **Audit:** every entry change, leave change, unlock, correction decision, settings change and
  member change is logged with who did it and when (Admin → Audit log).

```
src/lib/engine/        scoring engine, dates, demo data, tests (no framework code)
src/lib/server/        data access (repo.ts: plain queries; data.ts: signed-in reads/writes), seeding, Sheets sync
src/lib/supabase/      Supabase clients (user session, service role) and settings
src/proxy.ts           keeps the session fresh and sends signed-out visitors to /login
src/app/(portal)/      all signed-in pages; admin/ is admin-only
src/app/actions/       server actions (auth, entry, admin)
supabase/migrations/   database schema, row-level security and functions
supabase/tests/        database security tests
scripts/               setup and demo seeding
```

## Who can do what

- **Everyone (no sign-in):** home, standings, schedule, teams, players (each person's
  progress), leaderboards, awards and rules. The site is open and read-only.
- **Admins** sign in from the "Admin sign-in" link at the bottom of any page. Only they can
  enter steps (any team, any day of the season up to today), mark leave, and use the Admin
  area: season dates and rules, teams, captains, members and admin access, fixtures and
  challenges, leave records, CSV import and export, Sheets backup, weekly recap and audit log.

People don't need accounts. Only admins get a sign-in (with a temporary password to share,
which they can change under **Account**). Each team can have a **captain**, shown on the
team page; captains can't change anything.

## Season rules (all configurable in Admin → Season & rules)

| Daily steps | Team points |
| ---: | ---: |
| Under 5,000 | 0 |
| 5,000–7,999 | 1 |
| 8,000–9,999 | 2 |
| 10,000–11,999 | 3 |
| 12,000+ | 4 |

- Weekly fixture (Mon–Sun): higher team points total wins. Win 2, draw 1, loss 0.
- Table order: league points, then fixtures won, then team activity points, then total steps.
- Leave removes the member from that day's possible points and pauses (does not break) streaks.
  A missing entry earns 0 and is never auto-filled.
- Moving a member to another team takes effect from that day; their earlier steps and points
  stay with the team they were on at the time.
- Admins can enter or correct any day of the season up to today. Values above 50,000 need an
  extra confirmation. A finished week's result shows as provisional for `correctionDays` days.
- Monthly Cup per calendar month; Final Sprint trophy for the last 14 days; Season Champion is
  the league leader at the end.
- Awards every Sunday with joint winners on ties: Weekly MVP, Consistency Star, Comeback Walker
  (biggest rise in average daily steps vs your previous week, needs 3+ recorded days in each),
  Team Player (top point contributor in the team with the highest active member-day rate).
- Most improved: latest 7-day average vs first 7-day average, recorded days only (3+ in each
  window), available from day 14.
- Streaks count consecutive days at 5,000+ steps. Today's pending entry doesn't break a streak.

All dates and deadlines use the season timezone (default `Asia/Kolkata`).

## Configuration

See `.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public project settings.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only secret. Keep it out of Git and never give it a
  `NEXT_PUBLIC_` prefix.
- `ALLOWED_EMAIL_DOMAIN`: limits admin sign-in to your domain. People you add don't sign in,
  so their email addresses can be anything.
- `DEMO_MODE`: demo sign-in buttons and **Reset demo data**.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`: used once by `npm run setup`.
- `GOOGLE_SHEETS_WEBHOOK_URL`, `GOOGLE_SHEETS_SECRET`: optional Sheets backup, see
  [docs/google-sheets.md](docs/google-sheets.md).

## Good to know

- **The site is public.** Anyone with the link can see names and daily steps. If that's too
  open, add a custom domain on your company network, or turn on Vercel's password protection
  (a paid Vercel feature).
- **Dates and deadlines** use the season timezone (default `Asia/Kolkata`), both in the app and
  in the database rules.
- **Backups:** Supabase's free tier has no automatic backups you can restore yourself. Run
  `npm run backup` (whole database to a JSON file, ignored by Git), use
  **Admin → Data & corrections → Download all entries (CSV)**, or turn on the Google Sheets
  backup.
- **Free-tier pausing:** Supabase pauses free projects after a week with no activity. During the
  season, daily entries keep it awake; if it pauses between seasons, resume it from the
  Supabase dashboard.
- **Password emails:** admins sign in with passwords another admin sets, so the app never
  depends on Supabase sending email. (Supabase's built-in email is heavily rate-limited; add
  your own SMTP in Supabase if you later want self-service password resets.)
