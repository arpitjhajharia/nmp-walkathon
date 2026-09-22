# Optional Google Sheets backup

The portal database is always the source of truth. When this is switched on, every saved
entry is also written to a Google Sheet for reporting and backup. If Sheets is unreachable,
the save still succeeds.

## 1. Create the sheet and script

1. Create a Google Sheet, for example "Walkathon backup".
2. Open **Extensions → Apps Script** and replace the code with:

```js
const SECRET = "a-long-random-string"; // must match GOOGLE_SHEETS_SECRET
const HEADER = ["date", "name", "email", "team", "steps", "onLeave", "points", "updatedBy", "updatedAt"];

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) return ContentService.createTextOutput("forbidden");
  const sheet = SpreadsheetApp.getActive().getSheetByName("Entries") || SpreadsheetApp.getActive().insertSheet("Entries");
  if (body.kind === "full") {
    sheet.clearContents();
    sheet.appendRow(HEADER);
    const rows = body.rows.map((r) => HEADER.map((h) => r[h] ?? ""));
    if (rows.length) sheet.getRange(2, 1, rows.length, HEADER.length).setValues(rows);
    return ContentService.createTextOutput("ok");
  }
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADER);
  const data = sheet.getDataRange().getValues();
  for (const r of body.rows) {
    const values = HEADER.map((h) => r[h] ?? "");
    const i = data.findIndex((row) => row[0] === r.date && row[2] === r.email);
    if (i > 0) sheet.getRange(i + 1, 1, 1, HEADER.length).setValues([values]);
    else sheet.appendRow(values);
  }
  return ContentService.createTextOutput("ok");
}
```

3. **Deploy → New deployment → Web app**. Execute as *Me*; access *Anyone with the link*.
4. Copy the web app URL.

## 2. Configure the portal

```
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/XXXX/exec
GOOGLE_SHEETS_SECRET=a-long-random-string
```

Restart the portal. **Admin → Data & corrections** will show "Connected" and a
**Send a full copy now** button that rewrites the sheet from the database.
