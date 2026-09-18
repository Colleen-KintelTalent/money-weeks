# Making his data harder to lose

Read `BRIEF.md` first. Nothing here changes the two stream model or the money
arithmetic. This is entirely about the gap between "his data is safe" and "his data
is safe as long as he remembers to do something".

The context: everything lives on one phone. Lose the phone, clear the site data, or
have the browser evict storage when the phone fills up, and it is gone. There is no
server copy by design. That design is right, but it puts the whole burden on him
taking backups, and right now taking one is a five step chore ending in a file
sitting in his Downloads folder where it helps nobody.

Three changes. The second one matters most.

## 1. Ask the browser to protect the storage

The app has never called `navigator.storage.persist()`. Without it, its data sits in
the same bucket as any website he has ever visited and can be evicted when the phone
runs low on space. With it, the browser treats the data as worth keeping and will not
clear it to reclaim room.

Call it once, after he completes setup, not on first paint. Android grants it
silently for an installed app in most cases. Store whether it was granted.

Then surface the answer honestly in the Setup tab, beside the backup buttons. Granted:
one line saying the phone has been asked to keep this data and agreed. Not granted:
one line saying the phone may clear it if storage runs low, so backups matter more.
Do not dress either up. He should know which situation he is in.

This protects against accidental eviction. It does nothing about him clearing site
data deliberately, and nothing about a lost phone. Say so in that line rather than
implying it is a safety net it is not.

## 2. One tap to send the backup somewhere off the phone

This is the change that actually reduces risk.

Today the backup downloads to the phone. He then has to find the file, open another
app, attach it, and send it. Most people do that once and never again, and a backup
sitting only on the phone it is backing up is no backup at all.

Use the **Web Share API** with files (`navigator.share` with a `files` array, guarded
by `navigator.canShare({ files })`). On Android Chrome this opens the system share
sheet and he picks Drive, Gmail, WhatsApp, whatever he uses. One tap, and the copy
lands somewhere that survives the phone.

Both backups get this: the figures file and the photos file.

Keep the existing download button as well, for desktop and for any browser where
sharing files is unsupported. Feature detect properly and show the share button only
when it will work, rather than offering a button that silently does nothing. On
iPhone, Safari supports this and Chrome does not, so detection has to be real rather
than assumed from the platform.

Wording on the buttons should say where it goes, not name the API. "Send a copy off
this phone" beats "Share".

After a successful share, record it the same way a download is recorded, so the
reminder in item 3 counts it.

## 3. A reminder that says what is at stake

The current nudge appears after thirty days and says roughly "it has been a while".
Two problems: thirty days is too long for something he is relying on at tax time, and
a generic prompt is easy to scroll past.

Change it to fourteen days, and make it specific. Count what would be lost: how many
weeks of entries and how many receipt photos have been added since his last backup,
and say that. "Nineteen entries and seven receipt photos since your last backup"
gives him a reason to act that "it has been a while" does not.

Keep the two files distinct in the wording, because they have different rhythms. The
figures file is small and worth taking often. The photos file is large and once a
quarter, or after a run of claimable spending, is plenty.

If he has never backed up at all and has more than a week of data, that message
should be firmer than the recurring one. That is the genuinely exposed case.

Do not make it modal and do not make it undismissable. A card he can scroll past is
the right level. Nagging gets ignored, and worse, gets the app ignored with it.

## Constraints

- Nothing leaves the device except when he taps share, and then only to where he
  chooses. No automatic upload, no analytics, no account.
- Both existing backup files, both restores, and the per financial year photo export
  all keep working exactly as they do.
- No change to the money arithmetic. No change to `KEY` beyond recording the
  persistence result and the last backup timestamps already stored.
- Bump `CACHE` in `sw.js`.
- Test at 380px wide.

## Testing

1. Fresh setup on Android Chrome: persistence is requested and the Setup tab reports
   what was granted.
2. Share the figures backup: the system sheet opens, sending to Drive produces a file
   that restores correctly afterwards.
3. Share on a browser without file sharing support: the button is not shown, the
   download button still works.
4. Add entries and a couple of receipts, then check the reminder counts them
   correctly and names both file types.
5. Back up, confirm the reminder goes quiet, then confirm it returns after fourteen
   days rather than thirty.
6. Never backed up, more than a week of data: the firmer message appears.
7. Work through the checklist in `BRIEF.md` afterwards.
