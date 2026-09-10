# Next round of changes

Four changes requested after the first week of real use. Read `BRIEF.md` first —
the two-stream model and the design rules still hold, and nothing below overturns
them. Where a change brushes against a rule, that's called out.

Item 2 is deliberately missing — it's still being pinned down and will be added
here. Don't guess at it.

---

## 1. Savings should be viewable and correctable, like investments are

**The problem.** Savings is currently derived only from what he's allocated and been
repaid. If the real balance drifts from what the app thinks — a fee, interest, a
transfer he forgot to record — there's no way to say "actually it's $12,340". Every
investment has that ability; savings doesn't.

**Build.** On the Goal tab, give savings the same treatment a holding gets: the
current figure, and an input for what's actually in the account. Saving a different
figure writes a correction rather than overwriting anything.

Add to the data shape:

```js
adjustments: [{ id, date, amount, note }]   // amount is the delta, + or −
```

and `savings` becomes `Σ income.toSavings + Σ repayments.amount + Σ adjustments.amount`.

Store the delta, not the new total, so history stays intact and the entry can be
deleted like anything else. Label it in history as a correction, not as savings he
made — it must not inflate the weekly "put away" bars on the dashboard, which are
meant to show what he actually set aside.

---

## 3. Receipt photos for claimable work spending, with GST

**The goal.** Photograph a work receipt, have it come off spending money like any
expense, and keep it somewhere he can pull the lot out at tax time with the GST
broken out.

**Scope for this round: photo plus typed total. No OCR.** Reading receipts
automatically needs either a cloud vision API — which means an API key in a public
repo, per-scan costs, and his receipts leaving the device — or an in-browser OCR
library, which is a multi-megabyte download that performs poorly on crumpled thermal
paper. Both break rules 5 and the no-dependencies rule for a feature that saves
maybe fifteen seconds of typing. Leave a clean seam for it later; don't build it now.

**Capture.** `<input type="file" accept="image/*" capture="environment">` opens the
camera directly on Android. Compress client-side with a canvas before storing —
target the long edge at around 1600px and JPEG quality about 0.7. A receipt photo
should land near 200KB, not 4MB.

**Storage.** Images go in **IndexedDB**, not localStorage — localStorage is a ~5MB
string store and a handful of photos would blow it and take the rest of his data
down with it. Keep all existing state in localStorage exactly as it is; add IndexedDB
purely as an image blob store keyed by receipt id. If IndexedDB is unavailable, the
expense still saves without the photo and says so.

**Fields on a receipt expense.** Amount (total paid), supplier, date, category, and:

- `gst` — default to `total / 11`, rounded to cents, and **editable**. Australian GST
  is 10% included in the price, so the included component is a rounded eleventh.
- A **"no GST"** toggle that zeroes it. Fresh food, some medical and education
  spending are GST-free, and dividing by 11 anyway would overclaim.
- `claimable: true` for these.

**The $82.50 rule.** The ATO requires a valid tax invoice to claim a GST credit on
purchases over $82.50 including GST. Below that, a receipt showing supplier, date,
amount and what was bought is enough. So when the total exceeds $82.50, show a quiet
flag on the entry — "needs a proper tax invoice" — and let him mark it as held. It's
the difference between a claim that stands up and one that doesn't, and he won't know
it otherwise.

**A claimable view**, reachable from Spending: every claimable expense, its GST, the
running totals for both, filterable by financial year (1 July to 30 June). CSV export
with columns Date, Supplier, Description, Total, GST, Tax invoice held. That's the
file his accountant wants.

Put one plain line in that view: this is a record of what he spent, not tax advice,
and what's actually claimable is between him and his accountant.

**Backup implications, and don't skip this.** The existing JSON backup won't carry
images. Either include them base64-encoded (the file gets large fast) or add a
separate "export receipts" action. Whichever you choose, the restore screen must say
plainly whether photos are included, so he never restores a backup believing his
receipts came with it when they didn't.

---

## 4. History that's easy to go back through

**The problem.** Past activity is scattered — pays on one tab, expenses grouped on
another, moves buried in a list, valuations nowhere. Going back to find something
means hunting, and each list shows everything at once.

**Build a single History tab.** One reverse-chronological timeline, grouped by pay
week, every week collapsed except the current one. Each row is one line: date, what
it was, amount, and a coloured dot for its type.

Everything appears in it: pays, moves between pots, expenses, bills paid, repayments,
investment valuations, savings corrections.

**Filter chips across the top** — All, Money in, Spending, Moves, Investments — plus
a text search across descriptions and suppliers. Default to All.

Each week header shows in, out and net put away, so scanning tells him the shape of
a week without expanding it.

Tapping a row expands it for detail and gives the delete control. Keep delete behind
the expansion so it can't be hit by accident while scrolling.

**Tab budget.** This would make six tabs, which is too many at 380px wide. Fold the
Owed tab into the Goal tab as a section — it's goal money either way, and it's the
least-visited screen. Final five: Pay, Spending, Goal, History, Setup.

Trim the now-duplicated lists: drop "Recent pays" from the Pay tab entirely, and cut
the Spending tab's week list to the current week only, with a link across to History.
Each thing should live in one place.

---

## Applies to all of the above

- No new dependencies, no framework, no build step. Same as ever.
- Nothing leaves the device. Receipt photos especially — no upload, no API.
- Bump `CACHE` in `sw.js`, or installed phones keep serving the old copy.
- Bump `KEY` only with a migration path. Existing data must survive: he's been using
  this for real.
- Test on a narrow viewport. It's used one-handed on a phone, not on a laptop.
- Work through the checklist in `BRIEF.md` afterwards — the investment valuation
  cases in particular. Item 1 touches the same arithmetic.
