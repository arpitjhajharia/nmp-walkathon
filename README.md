# Office Walkathon Portal

A 100-day office walking league: four teams of five, daily step points, weekly
head-to-head fixtures, a league table, monthly cups, a Final Sprint, individual awards,
badges and optional weekly challenges. Team leads enter steps; everything else updates
automatically.

## Quick start

Requires **Node.js 22.5+** (it uses the built-in `node:sqlite`, so there are no native
modules and no external database to set up).

```bash
npm install
npm run dev
```

Open http://localhost:3000. In demo mode (the default in development) the sign-in page has
one-click buttons for a **participant**, a **team lead** and an **admin**. Every demo account
uses the password `walk2026`. The demo season is generated around today's date, so it is
always mid-season with realistic data, including a team that has entered today, one partial
and one not started.

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Scoring-engine tests (bands, fixtures, standings, leave, streaks, awards) |
| `npm run typecheck` | TypeScript check |

## How it's built

- **Next.js 16 (App Router) + React 19 + Tailwind CSS 4.** Server components render every
  page; mutations are server actions.
- **SQLite via `node:sqlite`.** The file is `data/walkathon.db` by default (`DATABASE_PATH`).
- **One scoring engine** (`src/lib/engine/engine.ts`), pure and unit-tested. Pages compute
  daily scores, fixtures, standings, trophies, awards, badges, challenges and insights from
  the raw entries on every request. A correction therefore updates everything it touches,
  including past weeks. After each save the results are also written to `fixture_results`,
  `league_standings`, `weekly_awards`, `monthly_cups` and `user_badges` for reporting.
- **Auth:** email and password (scrypt-hashed), httpOnly session cookie. There is no
  self-signup; only people an admin adds can sign in. `ALLOWED_EMAIL_DOMAIN` restricts
  sign-in to your company domain.
- **Audit:** every entry change, leave change, unlock, correction decision, settings change and
  member change is logged with who did it and when (Admin → Audit log).

```
src/lib/engine/     scoring engine, dates, demo data, tests (no framework code)
src/lib/server/     database, queries & mutations, sessions, Sheets sync
src/app/(portal)/   all signed-in pages; admin/ is admin-only
src/app/actions/    server actions (auth, entry, admin)
src/components/     shared UI (fixture card, league table, nav, team badges…)
supabase/schema.sql Postgres/Supabase schema with row-level security (migration path)
```

## Roles

- **Participant:** home, standings, schedule, teams, leaderboard, awards, my progress, rules.
- **Team lead** (set per team by an admin): also **Enter steps** for their own team, edit
  within the correction window, mark leave, see entry status, and request an unlock for a
  locked date.
- **Admin:** also the **Admin** area: season dates and rules, teams, members and leads,
  fixtures and challenges, correction requests, date locks, leave records, CSV import and
  export, Sheets backup, weekly recap and audit log. Admins can enter steps for any team and
  date.

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
- Leads can edit until 11:59 PM the next day (`correctionDays`); older dates lock unless an admin
  unlocks them. Values above 50,000 need an extra confirmation.
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

Copy `.env.example` to `.env.local`. Key settings:

- `DEMO_MODE`: sample data, quick sign-in and **Reset demo data**. Defaults to `true` in dev,
  `false` in production.
- `DATABASE_PATH`: SQLite file location.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: bootstraps the first admin on an empty non-demo database.
  That admin then adds teams' members (each gets a temporary password to share privately).
- `ALLOWED_EMAIL_DOMAIN`: restricts sign-in and new members to your domain.
- `GOOGLE_SHEETS_WEBHOOK_URL`, `GOOGLE_SHEETS_SECRET`: optional Sheets backup, see
  [docs/google-sheets.md](docs/google-sheets.md).
- `WALKATHON_TODAY`: testing only; pretend it's a given date (try a date after the season ends
  to see the season awards).

## Going live

1. Set `DEMO_MODE=false`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ALLOWED_EMAIL_DOMAIN`, and a
   `DATABASE_PATH` on persistent storage.
2. `npm run build && npm start` on any Node 22.5+ host with a persistent disk: a small VM, an
   internal server, Railway/Render/Fly with a volume, or Docker.
3. Sign in as the admin, set the season name, start date and timezone, rename the four teams,
   add the 20 members, and choose each team's lead.

**Serverless hosts (e.g. Vercel) aren't suitable for the SQLite setup**, because their file
system isn't persistent. For those, move to Supabase: `supabase/schema.sql` has the matching
Postgres schema, row-level security (leads can only write their own team's entries inside the
correction window) and audit triggers. The data layer in `src/lib/server/data.ts` is the
single place to swap.

Back up `walkathon.db` regularly (or enable the Sheets backup). Keep the database file out
of OneDrive, Dropbox and iCloud folders, because sync clients can corrupt a live SQLite file.
