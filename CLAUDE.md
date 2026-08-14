# Prose & Thorns — notes for Claude sessions

## Top priority: no durable way to run the catalog pipeline

As of 2026-08-14: there is no working path to run `backend/src/pipeline/runPipeline.js`
(`npm run seed`) that durably persists its results. Fix this before adding new books.

- **No local Node**: check fresh each session (`which node`) — don't assume from this
  note alone, environments vary. As of 2026-08-14, this session's sandbox had no
  `node`/`npm` on PATH or in common install locations (nvm/volta/asdf/homebrew).
- **The live `POST /api/seed` endpoint exists but is unsafe to use as-is**: it's a
  password-gated (`ADMIN_PASSWORD`) route on the deployed Railway server that runs the
  pipeline using Railway's own Node. The problem: `railway.json` has no persistent
  volume configured, and this project's data model is "local
  `backend/data/prose-and-thorns.sqlite` is source of truth, committed to git, Railway
  rebuilds from that git snapshot on every deploy." Triggering the pipeline via that
  live endpoint writes only to the running container's ephemeral disk — any later
  `git push` (even something unrelated) redeploys from git and silently discards
  whatever the live run added. Books could appear, then vanish later with no obvious
  cause.
- **Fix options**: (a) get real Node in whatever sandbox is running, so the pipeline
  runs locally and its output gets committed the normal way, matching how every batch
  before this was almost certainly done; or (b) add a persistent volume to
  `railway.json` for `backend/data/`, or a step to pull the container's updated sqlite
  file back down into git after a live run.
- Once a durable path exists, run a **small** test batch first (2-3 new titles) to
  validate `backend/src/pipeline/seedVerification.js` — a new pipeline step added
  2026-08-14 that has never actually executed (built and reviewed, never run for
  real, since there was no Node to test it with). See
  `backend/src/pipeline/SEED_AUDIT_LOG.md` for the hallucinated-seed-title incident
  that motivated it.

## Current state (as of 2026-08-14)

~305 books, 126 seed authors in `seedList.js`, all individually verified real
against actual bibliographies (see `SEED_AUDIT_LOG.md` — a hallucinated-title sweep
found and fixed 6 bad entries). Two new audit checks (`title-mismatch`,
`unverified-hardcover-match`) added to `auditCatalog.js`, and several
identity-integrity finding categories are now permanently non-dismissible in
`admin.js` so a wrong-book match can't be silently disposition'd away again.
