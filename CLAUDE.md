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

## Current state (as of 2026-08-14)

~305 books, 126 seed authors in `seedList.js`, all individually verified real
against actual bibliographies (see `SEED_AUDIT_LOG.md` — a hallucinated-title sweep
found and fixed 6 bad entries). Two new audit checks (`title-mismatch`,
`unverified-hardcover-match`) added to `auditCatalog.js`, and several
identity-integrity finding categories are now permanently non-dismissible in
`admin.js` so a wrong-book match can't be silently disposition'd away again.
