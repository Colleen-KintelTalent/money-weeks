# Money Weeks — handoff brief

A weekly savings, spending and investment tracker for one person. Single page, no
backend, no accounts, no build step. One dependency, vendored: the receipt reader in
`vendor/` — see `RECEIPTS.md` for why that exception was made and `vendor/README.md`
for what is pinned. State lives in `localStorage` on the user's own device, with
receipt photos in IndexedDB beside it.

Built for one person on an Android phone, paid on a fixed weekday, holding several
investments that they move money between often. The target is a savings goal by a
fixed date.

**Read the model section before changing anything.** The design went through one
full rewrite because the first version tracked the wrong thing, and the rules below
are what came out of that.

## The model: two streams

Money arrives and is split straight away. That split is the whole app.

**Stream one, the goal.** Savings plus what the investments are worth today. This is
what the headline number and the deadline maths are about.

**Stream two, spending money.** A single rolling balance. Whatever's left after
money is set aside, minus spending and what bills take. It rolls over week to week
— no reset, no weekly envelope. Underspending just means more the next week.

The two never mix by accident. Logging an expense can never change the goal. Setting
money aside can never look like spending. Every figure on screen is derived from
four lists: allocations, expenses, valuations, corrections.

### Derived quantities

```
savings     = Σ income.toSavings + Σ repayments.amount + Σ adjustments.amount
holding.put = Σ income.invest[holdingId]              // negative entries = sold down
holding.value = lastValuation
                ? lastValuation.value + Σ contributions dated after it
                : holding.put                          // never valued: worth what went in
holding.growth = value − put
goalTotal   = savings + Σ holding.value
wallet      = Σ (income.amount − toSavings − Σ invest) − Σ expenses
billsPending= recurring occurrences due on or before the end of the current pay week
safe        = wallet − billsPending                    // the "left to spend" figure
required    = (goal − goalTotal) / weeks remaining
rate        = mean of the last 4 pay weeks' (toSavings + invest + repayments)
```

Note what `rate` leaves out: `adjustments`. A correction is not money he set aside, so it
moves `savings` and the goal but never the weekly bars. See rules 4 and 5.

Weeks run payday to the day before the next payday — Wednesday to Tuesday by default,
set by `payDay` (0=Sunday). `weekEnd()` derives the boundary; don't hardcode Sunday.

### Transfers are allocations with a minus sign

Moving money between pots — savings to spending, savings to XRP, VGS to savings, any
direction — writes one income entry with `amount: 0` and a negative on the source
side, positive on the destination. Spending money is the implied remainder, so it
needs no explicit term.

```js
// VGS → Savings, $500
{ amount: 0, toSavings: +500, invest: { vgs: -500 } }
// Savings → Spending, $300
{ amount: 0, toSavings: -300, invest: {} }
```

This is why no separate transfer concept exists, and why adding one would be a
regression. It also means the arithmetic is verifiable: savings + investments +
spending money always equals everything paid in, plus real investment growth, minus
everything spent.

## Design rules — please don't undo these

**1. Expenses never touch the goal.** They come off spending money only. Two pots
that both claim the same dollar is how a tracker drifts and stops being believed.

**2. Investment value carries forward.** A deposit made after the last valuation
raises the value by the same amount; a withdrawal lowers it. Without this, paying
into a holding reads as an instant loss and selling one shows a phantom gain. This
is subtle and was a real bug — see the checklist.

**3. Bills are confirmed, never auto-posted.** Due items show Paid / Skip.
`dueList()` generates every missed occurrence up to today, capped at 60 iterations.
Auto-posting a bill that didn't go out puts the wallet permanently out of step.

**4. Savings corrections store the delta, never the new total.** Typing "actually it's
$12,340" writes one `adjustments` entry for the difference. Overwriting a total instead
would erase the history behind it and leave nothing to delete when he gets it wrong.

**5. A correction is not money put away.** It changes `savings`, so it changes the goal,
but it stays out of the weekly bars and out of `rate`. A bank fee or a forgotten transfer
flattering "put away each week" is how the dashboard stops meaning anything.

**6. Receipt photos live in IndexedDB, never localStorage.** localStorage is a ~5MB
string store holding every figure in the app; a handful of photos would blow it and take
the rest down with it. Photos are blobs in their own database, keyed by expense id, and
the expense still saves without one if IndexedDB is blocked.

**7. Money owed sits outside the goal.** It counts when it's actually received, at
which point it lands in savings via a `repayments` entry.

**8. Nothing leaves the device.** No analytics, no network calls, no CDN beyond the
Google Fonts import, which degrades to a system font offline. The receipt reader is
vendored rather than loaded from a CDN for exactly this reason: it reads the photo in a
worker on the phone, and no receipt is ever uploaded anywhere. `probeStorage()` runs
at boot and shows a banner if storage is blocked rather than losing data quietly.
Backup and restore are JSON file download and upload.

**9. `safe`, not `wallet`, is what's shown.** Bills falling due before the next
payday are already subtracted, so "left to spend" is money that's genuinely available.

## Data shape

```js
{
  goal: 40000,
  deadline: "2026-12-25",
  payDay: 3,                                   // 0=Sun … 3=Wed
  lastBackup: "2026-09-07",                    // figures; drives the 14-day reminder
  lastBackupN: 42,                             // entries at that moment, so the reminder can count what is new
  lastPhotoBackup: "2026-07-01",               // photos; a slower rhythm, see below
  lastPhotoBackupN: 12,
  persisted: true,                             // what navigator.storage.persist() answered; null = browser can't say
  holdings:   [{ id, name }],                  // "VGS", "XRP", …
  income:     [{ id, date, amount, toSavings, invest: {holdingId: n}, moveLabel? }],
  expenses:   [{ id, date, amount, what, cat }],
  recurring:  [{ id, name, amount, freq, next, cat }],   // weekly|fortnightly|monthly
  owed:       [{ id, who, amount }],
  repayments: [{ id, date, who, amount }],
  adjustments:[{ id, date, amount, note }],    // savings corrections; amount is the delta
  investValues:[{ id, date, hid, value }],     // manual valuations, sorted by date
  categories: [{ id, name, color }]
}
```

An expense is `{ id, date, amount, what, cat }` plus, when it came off a bill, `bill: true`,
and when it's a work receipt: `supplier`, `gst`, `noGst`, `claimable`, `invoiceHeld`, and
`photo: true` if a picture of it is in IndexedDB under the same id. `readFields` lists any
figures that were read off the photo and never checked by hand, which is what the warning
in the claimable list is driven by. `readReceipts` on the state turns the reader off.

`KEY` is `moneyweeks:v4`; `load()` migrates a `v3` save by folding its single lump of
investments into one holding. Bump `KEY` only alongside a migration, or existing
users lose everything. New lists are added by giving `migrate()` an empty default, which
is how `adjustments` arrived without a bump.

Photos are separate: database `moneyweeks-receipts`, store `photos`, one JPEG blob per
expense id. Nothing derives from it — it is only ever displayed.

## Architecture

Plain JS, no framework. `render()` rebuilds the view into `#app` and restores scroll.
Inputs are uncontrolled and read from the DOM on submit, so a re-render never fights
the keyboard. All clicks go through one delegated listener keyed by `data-act`.
Adding a feature means: a view function, a `data-act` branch, and a field in the
shape above.

Five tabs is the ceiling at 380px: Pay, Spending, Goal, History, Setup. Owed is a section
on Goal, and the claimable view is a sub-screen of Spending (`spendSub`). Each thing lives
in one place — History is the only full list of past activity, and the Spending tab shows
the current week only.

Two exceptions to "`render()` rebuilds everything": the receipt half of the expense form
is shown and hidden in place, and the History search box refills only `#hist-body`. Both
exist so a re-render can't take away something already typed.

`addMonths()` clamps to the end of short months — 31 Jan rolls to 28 Feb, not 3 Mar.
Don't swap it for a bare `setMonth()`.

## Files and deploying

| File | What it is |
|---|---|
| `index.html` | The whole app. HTML, CSS and JS in one file, on purpose. |
| `manifest.webmanifest` | Makes it installable to the home screen. |
| `sw.js` | Service worker, cache-first, so it opens with no signal. `vendor/` is kept out of `SHELL` and cached only once it is actually used. |
| `vendor/` | The pinned receipt reader, about 10MB. Downloads on first use, never at install. |
| backup `.json` | Every figure, no photos. Says so in the file. Downloaded, or sent off the phone via the share sheet. |
| receipts `.json` | Photos only, base64, much larger. Restore takes either. |
| `icon-*.png` | App icons. |

Static host, served over **https** (or `localhost`) or the service worker won't
register. All files in one directory; paths are relative.

**After any change to `index.html`, bump `CACHE` in `sw.js`.** It's on `money-weeks-v5`
now. Skip this and installed phones keep serving the cached old copy.

Local testing: `python3 -m http.server 8000`. Opening `index.html` as a `file://` URL
works on desktop but the service worker is skipped and Android storage is unreliable
— expected, not a bug.

## Testing checklist

No test harness. These are the cases that have actually broken:

1. Set up a goal, two holdings (VGS, XRP), opening savings and spending money.
2. Record a pay split across savings and both holdings → spending money is the
   remainder, the dashboard bar shows what was put away.
3. Value VGS above what went in → shows a gain. **Then pay another $400 into it: the
   gain must not change.**
4. **Move $500 from VGS to savings: the gain must still not change**, VGS's value
   drops by $500, savings rises by $500.
5. Move savings → spending, then log an expense against it. The goal falls once, not
   twice.
6. Add a monthly bill dated last month → appears due twice, Paid deducts from
   spending money, Skip doesn't.
7. Someone repays part of what they owe → savings rises, the debt falls, the goal was
   never inflated beforehand.
8. Sum check: savings + investments + spending money = paid in + growth − spent.
9. Backup, wipe, restore → everything returns. Restore is offered on the first-run
   screen too, which is the only place a new phone can reach it.
10. Photograph a receipt over $82.50: GST fills in as a rounded eleventh, the tax-invoice
   flag appears, the photo lands near 200KB in IndexedDB, and the goal doesn't move.
   Tick "no GST" and it zeroes. Delete the expense and the photo goes with it.
11. Correct the savings balance: savings and the goal move by the difference, spending
   money doesn't, and **the weekly bars are unchanged**.
12. Airplane mode from the home screen → still opens.
13. **Dates must not shift by a day.** Every date helper formats from local
    calendar components via `isoLocal()`. Building one with
    `new Date(...).toISOString().slice(0,10)` parses at local midnight and then
    converts to UTC, which rolls back a day in any UTC-positive timezone. That
    bug moved the pay-week boundary, dated morning entries to the day before,
    and made `advance()` lose a day per occurrence, so recurring bills drifted
    backwards through the calendar. Check `addMonths("2026-01-31", 1)` is
    `2026-02-28` and not the 27th.

## Not losing it all

Everything is on one phone, so three things guard against that, set out in `BACKUP.md`:

`navigator.storage.persist()` is requested once after setup (and once for existing saves,
the first time Setup is opened), so the browser won't evict the data when the phone fills
up. The answer is reported plainly in Setup — granted or not — because he should know
which situation he is in. It does nothing about clearing site data or a lost phone, and
the wording says so.

Both backups can go straight to the share sheet, which is the change that actually
reduces risk: a backup sitting on the phone it is backing up is not a backup. Sharing is
feature-detected with a real `navigator.canShare({files})` probe, never guessed from the
platform, and the download buttons stay for everything else. A completed share is recorded
exactly as a download is; a cancelled one is not.

The reminder counts what is at stake — "19 entries and 7 receipt photos since your last
backup" — rather than saying time has passed. Figures are due after 14 days, photos after
90, and the two are worded separately because they have different rhythms. Never having
backed up with more than a week of history gets a firmer card. It stays a card he can
scroll past, with a Not now that hushes it for the session. A per-financial-year photo
export deliberately does **not** count as a photo backup, or it would claim the other
years are safe.

## Reading receipts

Built, and set out in full in `RECEIPTS.md` — read that before touching it. In short:
Tesseract.js runs in a worker on the phone, on a sharper copy of the photo taken before
`compress()` shrinks it for storage. It fills in the total, the date, the GST and the
supplier, marks every field it filled so an unchecked figure can't quietly become a tax
claim, and says so plainly when it can't read something rather than guessing. An explicit
GST line on the docket always beats dividing by eleven. There is an off switch in Setup.

## Worth building next

- Import from CSV, to bring in existing spreadsheet history.
- Per-category weekly budget targets, shown against actuals.
- A "what if" line: the weekly rate needed if the deadline moves.
