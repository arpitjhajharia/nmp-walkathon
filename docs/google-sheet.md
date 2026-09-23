# Daily steps from a Google Sheet

Step counts live in a Google Sheet and are pulled into the portal. The portal works out
everything else: points, fixtures, standings, awards and badges.

## The sheet

One tab (by default **Data**), one row per person, one column per day:

| Team | Player | 22-Sep | 23-Sep | 24-Sep | … |
| --- | --- | ---: | ---: | ---: | --- |
| Sunrisers | Nikki Nalekar | 388 | 9,120 | L | … |
| Titans | Arpit Jhajharia | 2814 | | 7,004 | … |

- **Player** names must match the names in the portal. Capitals and extra spaces don't
  matter; anything unmatched is reported after a sync and skipped.
- **Team** is only checked, never changed. A mismatch is reported so you can fix whichever
  side is wrong.
- **Numbers** may contain commas. **Blank** means nothing recorded yet, and never deletes
  what's already saved. **L** (or "leave") marks a day on leave, which takes that person out
  of the team's possible points for the day and pauses their streak.
- **Dates** can read `22-Sep`, `22 Sep`, `2026-09-22` or `22/09/2026`. Columns outside the
  season are ignored and listed after a sync.
- **Future days** are skipped until the day arrives.

Share the sheet as **Anyone with the link → Viewer**. The portal only ever reads it.

## Connecting it

Set these wherever the app runs (`.env.local` locally, Environment Variables on Vercel):

```
GOOGLE_SHEET_ID=the-long-id-from-the-sheet-web-address
GOOGLE_SHEET_TAB=Data
CRON_SECRET=a-long-random-string      # optional but recommended; openssl rand -hex 24
```

## When it syncs

- **Once a day automatically**, at 11:00 India time (`"30 5 * * *"` UTC in `vercel.json`),
  which suits people reporting the previous day's total the next morning. Vercel's Hobby plan
  allows one scheduled run a day; change the time there if you prefer another. A sync always
  reads every day in the sheet, not just today, so late entries and corrections are picked up
  by the next run whatever date they belong to.
- **On demand** from **Admin → Data & corrections → Sync steps from the sheet**, which shows
  what changed, plus anything it couldn't match.
- **From your machine** with `npm run sync:sheet`.

Every change a sync makes is written to the audit log, marked "Google Sheet sync".

## Editing in the portal

Admins can still enter or correct steps in **Enter steps**. Be aware that if the sheet has a
value for that person and day, the next sync overwrites the portal's value: the sheet wins.
For a lasting correction, change the sheet.
