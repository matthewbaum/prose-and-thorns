# Prose & Thorns — notes for Claude sessions

## Node is already installed locally — check here before concluding otherwise

**Real, working Node lives at `~/.local/prose-and-thorns-node/bin/node`** (confirmed
v24.19.0 as of 2026-08-14). This is a project-specific install, not on the default
PATH of a fresh Bash session — `which node` alone will report nothing, which twice
now got misread as "no Node available on this machine" when the real situation is
"not on this shell's PATH by default." Before concluding Node is unavailable, always
check this exact path first:
```
~/.local/prose-and-thorns-node/bin/node --version
```
This same binary is what `npm run dev` (the root `concurrently` script running
`dev:backend` + `dev:frontend`) has been using all along — confirmed via `lsof` on
`backend/data/prose-and-thorns.sqlite` showing an active connection from it. To use
it in a given shell: `export PATH="$HOME/.local/prose-and-thorns-node/bin:$PATH"`.
(A second, redundant Node copy was briefly downloaded into `backend/.tools/` before
this was discovered — gitignored, safe to ignore or delete, not the canonical one.)

## The catalog pipeline now has a durable path — use the real Node above

`backend/src/pipeline/runPipeline.js` (`npm run seed`) can be run locally with the
Node install above, committing its output the normal way. Do **not** use the live
`POST /api/seed` Railway endpoint — it's password-gated but unsafe: `railway.json`
has no persistent volume, so a live run's writes hit the container's ephemeral disk
and get silently discarded by the next `git push`-triggered redeploy (which rebuilds
from git, not from whatever's live on the server).

**Cost note (learned 2026-08-14):** `runPipeline()` always iterates the *entire*
`SEED_BOOKS` list, not just newly-added titles — each step is individually guarded
("skip if already fetched"), so re-running is normally a cheap no-op for existing
books. The exception: when a *new* pipeline step/column is added (e.g.
`seedVerification.js`'s `seed_verified_at`), every existing book has never run that
new step, so a full `npm run seed` will trigger it for the whole ~300+ book catalog
at once — burning real Anthropic API credit on a backfill that usually isn't needed
(the existing catalog was already hand-verified in `SEED_AUDIT_LOG.md`'s 126-author
sweep). To test a small number of new titles cheaply without that side effect, call
`processBook()` (exported from `runPipeline.js`) directly against just the new seeds
instead of running the full `runPipeline()`.

## Database: full vs. slim (since 2026-10-13) — read before touching the .sqlite

There are two database files, because raw review text is ~85% of the database's size
and GitHub rejects any single file over 100 MB:

- **Slim — `backend/data/prose-and-thorns.sqlite`**: the *committed, deployed* file.
  Everything the live site serves (books, tags, ratings, quality profiles, audit
  findings) but **no review rows**. ~3.6 MB at 589 books, roughly 6 KB per added book.
- **Full — `backend/data/full/prose-and-thorns-full.sqlite`**: the working copy, with
  all review text. **Gitignored.** `db/index.js` picks it automatically whenever it
  exists (override with `PT_DB_PATH`); on Railway only the slim file exists, so the
  server falls back to it with no configuration.

Consequences for any session:
- Pipeline scripts, `npm run audit`, and the dev server all use the **full** copy
  automatically. The audit's quote-grounding checks need the review text, so they only
  work against the full copy.
- **Before committing a change that should reach production, run `npm run export-slim`
  (from `backend/`).** It refreshes the denormalized review stats
  (`stored_review_count`, `sampled_avg_rating`, `sampled_ratings_count`), checkpoints
  the full DB, and regenerates the slim file. Committing without it deploys stale data.
  It refuses to run if the process opened the slim file (that would destroy review text).
- Do **not** run pipeline scripts against the slim file or edit it directly.
- The full copy exists **only on this machine** (git history holds older full versions
  up to 2026-10-13). `npm run export-slim` also writes a dated, read-back-verified gzip
  of the full DB to `PT_BACKUP_DIR` (set in the gitignored `backend/.env`; currently a
  `prose-and-thorns-backups` folder in the user's personal Dropbox), keeping the newest 7.
  If `PT_BACKUP_DIR` is unset or the write fails, the export still completes but prints a
  loud SKIPPED/FAILED line — check for it. A one-off earlier gzip is in
  `backend/data/backups/` (gitignored).
- Two runtime queries stand in for the reviews table via the stored columns: the
  "has any reviews" visibility check and the last-resort rating tier in `booksRepo.js`.
  If another runtime query ever reads `reviews`, it will silently see nothing in
  production — use a stored column instead.
- Live visitor data (page views via `POST /api/track`, retailer clicks, and contact /
  book-request / reader-report submissions) lives in a separate, never-committed file,
  `backend/data/live/live.sqlite` (`db/liveDb.js`), so local test traffic never ships and
  deploys never overwrite production data. The admin dashboard reads it. On Railway,
  attach a volume (mount `/data`) and set `PT_LIVE_DB_PATH=/data/live.sqlite`, otherwise
  all of it is lost on every redeploy. The `submissions` / `retailer_clicks` tables still
  defined in `schema.js` are legacy and unused.

## Bulk UCSD run (2026-10-14 to 2026-10-16) — what it added and how to repeat it

The catalog went from 589 to 1,252 books. The pool was every UCSD Goodreads book with
>=200 written reviews that carries one of the tags paranormal-romance / romantasy /
fantasy-romance / fae (a series qualifies if >=1/3 of its main novels are tagged), minus
novellas, box sets, companions, foreign editions and anything already in the catalog:
666 candidates, 663 added (3 skipped as already present, 1 with no description anywhere).
Lists of what was added and cut are in `backend/data/ucsd-run/` (untracked CSVs).
- Scripts (all in `backend/src/pipeline/`): `addFromUcsdPool.js` (the add loop; reads
  `/tmp/goodreads-check/` data, which is scratch and was deleted afterwards),
  `postBatchFixes.js` (run after every batch: series totals, out-of-taxonomy tropes,
  ungrounded praise, wrong-book matches, missing syntheses, Google's fake cover images),
  `mirrorCovers.js` (copies Open Library covers into `frontend/public/covers/`),
  `repairConnectionFailures.js` (re-tags books left half-built by a network outage).
- Metadata falls back to the UCSD record (description, publisher, pages, date, ISBN) when
  Google Books is down, out of quota, or returns the wrong book. Google's quota is
  1,000 queries/day; 503 retries burn it, so keep retries to one.
- Covers: Google serves identical "image not available" graphics and interior text pages
  (title pages, "other books by" lists) as covers. Size checks miss the larger ones; a
  white-pixel scan (>=55% near-white) finds them. Open Library covers by ISBN are
  mirrored locally; books with nothing usable show a "Cover art unavailable" title card.
  Every replacement cover was checked by eye -- keep doing that.
- Network outages mid-run left books created but un-tagged/un-synthesized three times.
  `repairConnectionFailures.js` + `postBatchFixes.js` fix that; check for it after any
  run that logs "Connection error".
- The Mac must stay awake and plugged in (`caffeinate -i -m -w <pid>`); sleep freezes it.

## Current state (as of 2026-08-14, before the bulk run above)

~305 books, 126 seed authors in `seedList.js`, all individually verified real
against actual bibliographies (see `SEED_AUDIT_LOG.md` — a hallucinated-title sweep
found and fixed 6 bad entries). Two new audit checks (`title-mismatch`,
`unverified-hardcover-match`) added to `auditCatalog.js`, and several
identity-integrity finding categories are now permanently non-dismissible in
`admin.js` so a wrong-book match can't be silently disposition'd away again.
