# Reading receipts from the photo

Read `BRIEF.md` first. The two stream model and the design rules still hold. This
change breaks one of them deliberately and the reasoning is set out below.

## What this is for

He photographs a work receipt, or picks one from his camera roll, and the app fills
in the total and the date for him instead of him typing them. Everything stays
editable. This is a convenience on top of the existing flow, never a replacement
for it.

The aim is two fields filled in correctly most of the time, not a perfect reading of
the whole receipt. The total is the number that matters, GST is calculated from it,
and the date decides which pay week it lands in. Supplier and description are easier
to type than to extract reliably, so treat those as optional extras.

## The dependency exception

`CLAUDE.md` says no dependencies. This adds one, on purpose, and it is the only one.

Use **Tesseract.js**, pinned to a specific version, with the library, the worker and
the English training data **vendored into the repo** rather than loaded from a CDN.
That keeps the promise that matters more than the no dependency rule: nothing leaves
the device. No API key, no cloud service, no per scan cost, no receipt images sent to
anyone. A cloud vision service would read receipts far better, and it is not worth
what it costs here.

Do not add anything else. No image processing libraries, no framework, no build step.

**Loading.** The training data is around ten megabytes, so it must load lazily on
first use and be cached afterwards. Keep it out of the service worker `SHELL` array,
or every install pays for it whether he uses receipts or not. Show what is happening
on first run, something like "Getting the receipt reader ready, this happens once".
If he is offline the first time he tries it, say so plainly and fall back to typing.

## Where it runs in the flow

Run the reading **before** the image is compressed for storage. The stored copy is
deliberately small and soft, which is fine for a record but poor for reading text.
Take a separate higher resolution copy for reading, around 2000px on the long edge,
use it, then discard it. Store the small one exactly as now.

In the multiple photo chain, read each receipt when its turn comes up, not all of
them at once.

Show progress while it works, and give him a **Skip** control that abandons the read
and opens the empty form. Reading a receipt may take several seconds on a phone, and
he should never be stuck waiting when typing would have been faster.

## What to extract

**Total.** Look for a line containing TOTAL, AMOUNT DUE, BALANCE DUE or SUBTOTAL,
and take the most likely currency value on or just after it. Prefer TOTAL over
SUBTOTAL when both appear. If no keyword is found, fall back to the largest currency
value on the receipt, which is usually right. Ignore values on lines mentioning
CHANGE, CASH TENDERED or ROUNDING.

**Date.** Australian receipts are day first. Match `dd/mm/yyyy`, `dd/mm/yy`,
`dd-mm-yyyy`, `dd.mm.yyyy` and `dd MMM yyyy`. Where a date is ambiguous and could be
either order, choose the day first reading, and if that produces a date in the future
fall back to the other. Reject anything more than two years old or later than today,
and leave the field on the photo date instead.

**GST.** If the receipt shows an explicit GST or TAX line, use that figure. It is
more accurate than dividing, because receipts routinely mix taxable and GST free
items. Only fall back to total divided by eleven when no GST line is found. This
matters: a shop with fresh food on the docket will show less GST than an eleventh of
the total, and claiming the eleventh would be overclaiming.

**Supplier.** Optional. The business name is usually in the first two or three lines.
Offer it if something plausible is found, leave blank otherwise. Do not try hard.

## Showing him what it read

This is the part that decides whether the feature helps or quietly costs him money.

Fields filled in from the photo must be **visibly marked as such**, with a short note
beside them saying they came from the photo and should be checked. The marking clears
when he edits the field or taps to confirm it. A wrong total flows straight into a
tax claim, so he needs a reason to glance at it rather than tapping save on faith.

When nothing usable is found, say so in one plain line and open the normal empty
form. Do not fill in a guess. A blank field is honest, a wrong one is not.

Store a flag on the expense recording that a field was read rather than typed, so the
claimable list can show which entries were never checked by hand.

## An off switch

Add a toggle in Setup, on by default, that turns the reading off entirely. If he
finds it slow or wrong more often than not, he should be able to go back to typing
without waiting for a code change. When it is off, skip the library load completely.

## Constraints

- Nothing leaves the device. No network calls of any kind for this feature.
- The existing camera and gallery paths, the compression, the IndexedDB storage, the
  chain behaviour and both backup exports all stay exactly as they are.
- No change to `KEY` or the data shape beyond the read flag on an expense.
- Bump `CACHE` in `sw.js`.
- Test at 380px wide. This is used one handed on a phone.

## Testing

1. A clean printed receipt photographed flat. Total and date should both come out
   right.
2. A receipt with an explicit GST line. The GST field should match the receipt, not
   an eleventh of the total.
3. A crumpled or faded receipt. It should either read it or say it could not, never
   produce a wrong number silently.
4. A photo that is not a receipt at all. It must fail cleanly.
5. Pick four photos from the gallery. Each is read in turn, and Skip works on any of
   them.
6. Offline on first use. Says so plainly, falls back to typing.
7. Turn the toggle off in Setup. No library loads, form opens straight away.
8. Then work through the checklist in `BRIEF.md`. Nothing here should touch the
   money arithmetic, and that is worth confirming rather than assuming.
