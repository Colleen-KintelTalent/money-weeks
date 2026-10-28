# Money Weeks — handoff brief

A weekly savings, spending and investment tracker for one person. Single page, no
backend, no accounts, no build step. One dependency, vendored: the receipt reader in
`vendor/` — see **Reading receipts** below for why that exception was made, and
`vendor/README.md` for what is pinned. State lives in `localStorage` on the user's own
device, with receipt photos in IndexedDB beside it.

Built for one person on an Android phone, paid on a fixed weekday, holding several
investments that they move money between often. The target is a savings goal by a
fixed date.

**Read the model section before changing anything.** The design went through one
full rewrite because the first version tracked the wrong thing, and the rules below
are what came out of that.

## The model: three streams and a holding pen

Money arrives in the Pay pot whole, and is moved out from there. Moving it is the whole
app: the pay form asks only for the amount and the date, and Move money is the only way
money goes anywhere.

**The Pay pot.** Pay that hasn't been moved on yet. It is outside the goal, outside every
holding, outside "left to spend" and outside the rent pot, so a pay raises none of them
until he moves it. It only goes up from a pay (or a move back in), only comes down by a
move, and is never allowed below zero. See rule 11. (It was briefly called To sort, which
is why its field is `toSort`.)

**Stream one, the goal.** Savings plus what the investments are worth today. This is
what the headline number and the deadline maths are about.

**Stream two, spending money.** A single rolling balance. What's moved into it, minus
spending and what bills take. It rolls over week to week
— no reset, no weekly envelope. Underspending just means more the next week.

**Stream three, the rent pot.** Money for rent, held apart from both of the others. It
is not in the goal, not in any holding, and not in "left to spend". It only goes up when
rent is set aside out of a pay or moved in from another pot, and only comes down when
rent is paid or the balance is corrected. See rule 10.

The four never mix by accident. Logging an expense can never change the goal. Setting
money aside can never look like spending. Rent can never be spent twice. Unsorted pay is
never counted as anything until it's moved. Every figure on screen is derived from six
lists: allocations, expenses, valuations, corrections, rent paid and rent corrections.

### Derived quantities

```
savings     = Σ income.toSavings + Σ repayments.amount + Σ adjustments.amount
rent        = Σ income.toRent − Σ rentPaid.amount + Σ rentAdjustments.amount
toSort      = Σ income.toSort
holding.put = Σ income.invest[holdingId]              // negative entries = sold down
              + holding.before                         // put in before he used the app
holding.value = lastValuation
                ? lastValuation.value + Σ contributions dated after it
                : holding.put                          // never valued: worth what went in
holding.growth = value − put
goalTotal   = savings + Σ holding.value                // closed holdings included
wallet      = Σ (income.amount − toSavings − Σ invest − toRent − toSort) − Σ expenses
billsPending= recurring occurrences due on or before the end of the current pay week,
              excluding the ones marked fromRent
rentBillsPending = the fromRent ones, counted against the rent pot instead
safe        = wallet − billsPending                    // the "left to spend" figure
required    = (goal − goalTotal) / weeks remaining
rate        = mean of the last 4 pay weeks' (toSavings + invest + repayments)
```

Moving out of the Pay pot into savings or a holding is what puts money away, so a pay
shows in the weekly bars, and in `rate`, in the week he moves it rather than the week it
landed. Old pays, split on the spot before v5, still count in their own week.

Note what `rate` leaves out: `adjustments`, and everything to do with rent. A correction
is not money he set aside, so it moves `savings` and the goal but never the weekly bars.
Rent isn't goal money at all, so it is in neither. See rules 4, 5 and 10.

Weeks run payday to the day before the next payday — Wednesday to Tuesday by default,
set by `payDay` (0=Sunday). `weekEnd()` derives the boundary; don't hardcode Sunday.

### Transfers are allocations with a minus sign

Moving money between pots — savings to spending, savings to XRP, VGS to savings, savings
to rent, any direction — writes one income entry with `amount: 0` and a negative on the
source side, positive on the destination. Spending money is the implied remainder, so it
needs no explicit term. The rent pot is not a remainder, so it has one: `toRent`.

```js
// VGS → Savings, $500
{ amount: 0, toSavings: +500, invest: { vgs: -500 } }
// Savings → Spending, $300
{ amount: 0, toSavings: -300, invest: {} }
// Savings → Rent, $900
{ amount: 0, toSavings: -900, invest: {}, toRent: +900 }
// Rent → Spending, $300      (spending is the remainder, so only rent carries a term)
{ amount: 0, toSavings: 0, invest: {}, toRent: -300 }
// Pay pot → XRP, $50
{ amount: 0, toSavings: 0, invest: { xrp: +50 }, toRent: 0, toSort: -50 }
// Pay pot → Spending, $150   (spending is the remainder: −(−150))
{ amount: 0, toSavings: 0, invest: {}, toRent: 0, toSort: -150 }
// A $1,000 pay: all of it into the Pay pot
{ amount: 1000, toSavings: 0, invest: {}, toRent: 0, toSort: 1000 }
```

This is why no separate transfer concept exists, and why adding one would be a
regression. It also means the arithmetic is verifiable: savings + investments +
spending money + the rent pot + the Pay pot always equals everything paid in (counting
corrections and anything put in before the app), plus real investment growth, minus
everything spent and all rent paid.

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

**10. Rent money is spent once.** The rent pot is outside the goal, outside the
investments and outside "left to spend", because it is money already committed. A
regular bill can be marked `fromRent`, and then ticking it off comes out of the pot and
never out of spending money — which is the whole reason the flag exists. `billsPending`
counts only the bills that will actually hit the wallet, or rent would be deducted from
what he has left to spend on top of having been set aside for. The pot is never allowed
below zero: a move, a rent payment or a rent-pot bill that the balance won't cover is
refused with the figure that is actually in it, rather than quietly going negative. Rent
corrections follow rule 4 — the delta, never the new total.

**11. The Pay pot is a pot, not a remainder, and Move money is the only way out of it.**
It carries its own `toSort` term, exactly as the rent pot carries `toRent`, and spending
money stays the implied remainder. Every move — from any place to any other: the Pay pot,
spending money, the rent pot, savings, any open investment — is one allocation entry built
by `moveEntry()`, so it can't change his total or count anything twice. Nothing can go
below zero: a move bigger than what's in the place it comes from is refused with the
figure that's there, and so is deleting a pay whose money has since been moved on
(rule 15). Other buttons that move money ("Put this into savings", "Move money into the
rent pot", closing a holding) only open the same form filled in, or write the same entry.
A move reads back as "Moved $200 from Pay pot to XRP": `moveText()` works it out from the
entry each time, so it always uses today's names; `moveLabel` on old entries is only a
fallback for one that moved money more than one way. Read the pot through `sortOf()`,
never as `i.toSort` — it's absent on every entry from before v5, which is what makes an
old pay's remainder still read as spending money.

**12. Closing is not deleting.** Closing a holding (`closed: "date"`) only hides it from the
Move money and the Goal cards. Its past entries stay in every sum, so old weekly
totals and the goal don't move. A holding still worth something can't be closed as it
stands — that money would either vanish from the total or stay counted somewhere he can't
see — so Close offers to move the remainder into savings or the Pay pot first, as an ordinary
move. Closed ones sit in a collapsed list in Setup with Reopen. **Delete permanently** is
separate, sits behind a warning that says plainly his past totals will change, and
removes the holding as if it never existed: each pay's slice into it is taken off that
pay's amount, and every move to or from it is removed, so the other side gets its money
back. A holding with nothing recorded against it just has a ×.

**13. Put in is money moved, Worth now is the carried-forward value.** On each investment
card on the Goal tab: Put in = moved in − moved out + `before`; Worth now =
`holding.value` (rule 2 — never the bare last valuation, or paying in reads as a loss);
Up or down = the difference, in dollars and percent of Put in. Savings doesn't rise or
fall in value, so its card shows only the balance; its history lists moves, repayments
and corrections, and adds up to that balance. Every card's history is read off the same
entries, newest first, so it reaches back to the first one ever recorded.

**14. Categories are stored by id; two are locked.** One editor (`catEditor()`) lives in
its own Setup card, titled Spending categories, and opens in place from "Edit categories"
beside the picker on the Spending tab. Every change saves as it's made — there is no Save
button to miss — and a half-typed expense survives it (`renderKeeping()`). Renaming
changes the name on every past expense, because expenses only hold the id. "Work, claimable" drives the claimable
list and GST, and "Other" is where an expense goes when its category is removed, so
neither can be renamed or removed (`LOCKED_CATS`). Removing a category that's been used
asks first, then files its expenses and bills under Other, with Undo. Blanking a name
doesn't remove a category.

**15. Every delete is confirmed, then can be undone.** One handler (`DELS`) covers
expenses, pays, moves, bills and every other list. The undo is a snapshot of the figures
from just before, offered for six seconds, and it lapses the moment anything else is
saved so it can never roll back something newer. A receipt photo is only removed from
IndexedDB once the undo has lapsed. A delete that would leave the Pay pot or the rent pot
below zero is refused with the reason.

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
  holdings:   [{ id, name, closed?, before? }], // "VGS", "XRP"; closed = date; before = put in pre-app
  income:     [{ id, date, amount, toSavings, invest: {holdingId: n}, toRent, toSort?, moveLabel? }],
  expenses:   [{ id, date, amount, what, cat }],
  recurring:  [{ id, name, amount, freq, next, cat, fromRent? }],  // weekly|fortnightly|monthly
  owed:       [{ id, who, amount }],
  repayments: [{ id, date, who, amount }],
  adjustments:[{ id, date, amount, note }],    // savings corrections; amount is the delta
  rentPaid:   [{ id, date, amount, what, bill? }],      // rent out of the rent pot only
  rentAdjustments:[{ id, date, amount, note }],         // rent corrections; also a delta
  investValues:[{ id, date, hid, value }],     // manual valuations, sorted by date
  categories: [{ id, name, color }]
}
```

An expense is `{ id, date, amount, what, cat }` plus, when it came off a bill, `bill: true`,
and when it's a work receipt: `supplier`, `gst`, `noGst`, `claimable`, `invoiceHeld`, and
`photo: true` if a picture of it is in IndexedDB under the same id. `readFields` lists any
figures that were read off the photo and never checked by hand, which is what the warning
in the claimable list is driven by. `readReceipts` on the state turns the reader off.

`KEY` is `moneyweeks:v5`. `load()` reads it, and if it holds no usable save — missing,
`null`, unreadable, or without an `income` list — copies the newest of `OLD_KEYS` (`v4`,
then `v3`) forward through `migrate()`, leaving the old copy where it was and keeping
anything that was in the v5 slot under `moneyweeks:v5:unreadable`. A usable v5 save is
never replaced automatically. "Recover data from before the update", at the bottom of
Setup and shown only while a v4 copy exists, runs the migration again from that copy
after a confirmation, keeps what was there under `moneyweeks:v5:before-recover`, and can
be undone for a few seconds. Start over removes all of these keys, so nothing comes back. A `v3` save has its single lump of investments folded into one holding. The v5
migration keeps every entry as it is — `toSort`, `closed` and `before` are simply absent
on old data — and makes sure the locked categories exist, filing any expense or bill whose
category has gone under Other (which is how `catOf()` already displayed it). Restoring a
backup goes through the same `migrate()`. Bump `KEY` only alongside a migration, or
existing users lose everything. New lists are added by giving `migrate()` an empty default, which
is how `adjustments`, and later `rentPaid` and `rentAdjustments`, arrived without a bump.
`toRent` is absent on every entry written before the rent pot existed, which is exactly
what makes a backup taken back then restore with the pot at zero — read it through
`rentOf()`, never as `i.toRent`.

Photos are separate: database `moneyweeks-receipts`, store `photos`, one JPEG blob per
expense id. Nothing derives from it — it is only ever displayed.

## Architecture

Plain JS, no framework. `render()` rebuilds the view into `#app` and restores scroll.
Inputs are uncontrolled and read from the DOM on submit, so a re-render never fights
the keyboard. All clicks go through one delegated listener keyed by `data-act`.
Adding a feature means: a view function, a `data-act` branch, and a field in the
shape above.

Six tabs is the ceiling at 380px: Pay, Spending, Rent, Goal, History, Setup. Six is not a
guess — at 380px each tab gets about 55px, and the widest label, "Spending", needs about
50px of that at the 12px the tab bar uses. A seventh would not fit and neither would a
longer label, so measure before adding either. Owed is a section on Goal, and the
claimable view is a sub-screen of Spending (`spendSub`). The Put in / Worth now / Up or down
cards are on Goal. Pay holds the Pay pot with its pay-in form, then Move money. Closed
holdings are managed in Setup, and categories in Setup or from the Spending tab. Each thing lives in one place —
History is the only full list of past activity, the Spending tab shows the current week
only, and the Rent tab shows that one pot's own ledger.

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
| `sw.js` | Service worker. The page is network first with a three-second fallback to the cached copy, so an update shows the next time he opens it with signal and it still opens with none. Everything else is cache first. `vendor/` is kept out of `SHELL` and cached only once it is actually used. |
| `vendor/` | The pinned receipt reader, about 10MB. Downloads on first use, never at install. |
| backup `.json` | Every figure, no photos. Says so in the file. Downloaded, or sent off the phone via the share sheet. |
| receipts `.json` | Photos only, base64, much larger. Restore takes either. |
| `icon-*.png` | App icons. |

Static host, served over **https** (or `localhost`) or the service worker won't
register. All files in one directory; paths are relative.

**After any change to `index.html`, bump `CACHE` in `sw.js`.** It's on `money-weeks-v15`
now. Skip this and installed phones keep the old worker and its old cache. A phone still
on v14 or earlier (cache first) shows the old page once more, picks up the new worker in
the background, and has the update from the next open — no clearing site data.

Local testing: `python3 -m http.server 8000`. Opening `index.html` as a `file://` URL
works on desktop but the service worker is skipped and Android storage is unreliable
— expected, not a bug.

## Testing checklist

No test harness. These are the cases that have actually broken:

1. Set up a goal, two holdings (VGS, XRP), opening savings and spending money.
2. The pay form asks only for the amount and the date. Record a pay → it all lands in
   the Pay pot and the goal and spending money don't move. Move it on to savings, both
   holdings and spending → each rises by its part, the Pay pot keeps the rest, and the
   dashboard bar shows what was put away.
3. Value VGS above what went in → shows a gain. **Then move another $400 into it from
   the Pay pot: the gain must not change.**
4. **Move $500 from VGS to savings: the gain must still not change**, VGS's value
   drops by $500, savings rises by $500.
5. Move savings → spending, then log an expense against it. The goal falls once, not
   twice.
6. Add a monthly bill dated last month → appears due twice, Paid deducts from
   spending money, Skip doesn't.
7. Someone repays part of what they owe → savings rises, the debt falls, the goal was
   never inflated beforehand.
8. Sum check: savings + investments + spending money + the rent pot + the Pay pot = paid in
   (with corrections and any "put in before the app") + growth − spent − rent paid.
9. Backup, wipe, restore → everything returns. Restore is offered on the first-run
   screen too, which is the only place a new phone can reach it.
10. Photograph a receipt over $82.50: GST fills in as a rounded eleventh, the tax-invoice
   flag appears, the photo lands near 200KB in IndexedDB, and the goal doesn't move.
   Tick "no GST" and it zeroes. Delete the expense and the photo goes with it.
11. Correct the savings balance ("The real figure is different, fix it" under Savings on
   Goal): savings and the goal move by the difference, spending money doesn't, and **the
   weekly bars are unchanged**.
12. Airplane mode from the home screen → still opens.
13. A pay moved on with some to rent: goal, rent pot, spending and the Pay pot only change
    by their own parts, and the parts add back up to the pay.
14. Paid rent: only the rent pot changes. The goal, savings, investments, left to spend
    and the weekly bars are all untouched.
15. Move money savings → rent and back again: the goal total ends where it started, and
    spending money never moved at all.
16. Rent "fix it": only the rent pot changes, an `adjustments`-style delta is stored, and
    the weekly bars don't move.
17. Restore a backup taken before the rent pot existed → loads with rent at zero and the
    pot works from there. Take a fresh backup and the rent data comes back with it.
18. A regular bill marked "pay this from the rent pot" comes off the pot and **not** off
    spending money. Left to spend must not fall when it's ticked.
19. **Dates must not shift by a day.** Every date helper formats from local
    calendar components via `isoLocal()`. Building one with
    `new Date(...).toISOString().slice(0,10)` parses at local midnight and then
    converts to UTC, which rolls back a day in any UTC-positive timezone. That
    bug moved the pay-week boundary, dated morning entries to the day before,
    and made `advance()` lose a day per occurrence, so recurring bills drifted
    backwards through the calendar. Check `addMonths("2026-01-31", 1)` is
    `2026-02-28` and not the 27th.
20. **Close an account: past totals don't change.** Close VGS while it's worth something →
    it asks to move the money first. Move it to savings and close: the goal, the grand
    total and every weekly bar are exactly as before. VGS is gone from Move money and
    the Goal cards, and sits collapsed in Setup. Reopen brings it back. With
    nothing in it, Close closes straight away.
21. Delete an account permanently: the warning says past totals will change, VGS and every
    entry that touched it go, the bars change. Undo puts everything back exactly.
22. **Move money out of the Pay pot: the total doesn't change.** A pay goes to the Pay pot;
    the goal and left to spend don't move. Move it on in several small goes to savings, an
    investment, spending and rent: savings + investments + spending + rent + the Pay pot is
    unchanged after each. The form shows both places before and after, and the toast and
    History read "Moved $200 from Pay pot to XRP". Moving more than is in the Pay pot,
    savings, spending, rent or a holding is refused. Empty the Pay pot, then try deleting
    that pay: refused, and the pot stays at zero.
23. Put in / Worth now / Up or down on an investment card: value VGS above what went in,
    then move more in — Up or down doesn't change (rule 2). The percentage is of Put in,
    green up, red down. The Savings card shows only its balance. Tap a card: every amount
    in or out, newest first, with where it came from or went to, including old entries;
    savings' list adds up to its balance. Set "already put in" on XRP: Put in rises by
    that much and the history shows it.
24. **Rename a category: old expenses show the new name.** In Setup's Spending categories
    card, type over a name and press Enter — it saves at once, and their stored `cat` id
    doesn't change. Add one: it saves at once with its own colour. On the Spending tab,
    Edit categories opens the same editor; a rename or an add shows in the picker straight
    away and a half-typed expense is still there. Work and Other have no × and can't be
    edited. Remove a used category: it asks, No keeps it, Yes files its expenses under
    Other, Undo puts them back. A blank name keeps the old one.
25. Delete an expense, a pay, a move and a bill: each asks first, cancel keeps it, Undo
    puts it back exactly. Delete, then add something else: the undo is gone and the
    delete stays. A receipt photo survives until the undo lapses, then goes.
26. Migration: put a v4 save in localStorage and reload → every entry, account, bill and
    the rent pot are intact under `moneyweeks:v5`, and the v4 copy is still there. A v3
    save and a backup from before the rent pot both still load.
27. Network first: with the new worker in charge, change `index.html` on the server and
    reload once — the change shows. Then go offline and reload — it still opens.
28. 380px: no sideways scroll on any tab, with a card's history open.
29. **His real v4 data, first open.** Build history in the v4 app (from git): split pays
    into savings, holdings and rent; moves every way; rent paid, a rent-pot bill and a rent
    correction; a savings correction; a part repayment; valuations; a renamed, an added and
    a removed category with expenses in it; and a holding removed in v4. Put that v4 save
    in localStorage and open v5. Every figure must equal v4's own `derive()`: weekly
    totals, `rate`, savings, each holding's Put in, value and gain, the rent pot, spending
    money and left to spend. Every entry is unchanged, old pays keep their splits, the
    categories keep their names and colours, expenses in a removed category are under
    Other, and History shows each old pay's split. Reopen: still identical.
30. **An old v4 backup file restores** identically, both on the first-run screen and over
    existing data from Setup.
31. **Recovery.** With the v4 copy present and the v5 slot missing, `null`, unreadable or
    `{}`, opening the app migrates the v4 copy again and matches v4 exactly; an unreadable
    v5 slot is kept aside. With v5 data present it is never replaced automatically. In
    Setup, "Recover data from before the update" is the last card, asks first (No changes
    nothing), then matches v4 exactly, keeps the replaced data on the phone, and Undo puts
    the post-update entries back. With no v4 copy the card isn't shown; Start over removes
    the v4 copy so it can't come back.

## Not losing it all

Everything is on one phone, so three things guard against that:

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

Tesseract.js runs in a worker on the phone, on a sharper copy of the photo taken before
`compress()` shrinks it for storage. It fills in the total, the date, the GST and the
supplier, marks every field it filled so an unchecked figure can't quietly become a tax
claim, and says so plainly when it can't read something rather than guessing. An explicit
GST line on the docket always beats dividing by eleven. There is an off switch in Setup.

## Worth building next

- Import from CSV, to bring in existing spreadsheet history.
- Per-category weekly budget targets, shown against actuals.
- A "what if" line: the weekly rate needed if the deadline moves.
