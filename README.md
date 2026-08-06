# Prose & Thorns

Romantasy book discovery — filter by trope, subgenre, and series status; assess
quality (prose, romance, world-building, pacing, emotional payoff, character
depth) synthesized from real reader reviews on Google Books and Reddit.

Prototype scope: this demonstrates the full loop — filter → results grid with
covers → quality profile on click — for a hardcoded seed list of ~99 popular
romantasy titles.

## Stack

- **Frontend:** React + Vite (`frontend/`)
- **Backend:** Node.js / Express (`backend/`)
- **Database:** SQLite via `better-sqlite3`, file-based at `backend/data/prose-and-thorns.sqlite`
- **APIs:** Google Books, Reddit, Anthropic Claude

## Setup

1. Install Node.js 18+ (needed for native `fetch`).
2. Install dependencies:
   ```bash
   npm run install:all
   ```
3. Copy the env template and fill in your keys:
   ```bash
   cp .env.example backend/.env
   ```
   You'll need:
   - `GOOGLE_BOOKS_API_KEY` — free, enable "Books API" at [console.cloud.google.com](https://console.cloud.google.com/)
   - `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` / `REDDIT_USERNAME` / `REDDIT_PASSWORD` — free, register a "script" app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
   - `ANTHROPIC_API_KEY` — your Anthropic API key
   - `ADMIN_PASSWORD` — any string; gates the manual pipeline trigger

## Running locally

```bash
npm run dev
```

This starts the backend on `http://localhost:4000` and the frontend dev
server on `http://localhost:5173` (which proxies `/api` to the backend). The
database and its tables are created automatically on first backend boot, but
it starts **empty** — run the pipeline to populate it (see below).

## Seeding the database

The pipeline fetches metadata, reviews, and generates trope tags + quality
profiles for the seed list in `backend/src/pipeline/seedList.js`. It respects
a 1-second delay between external API calls and never re-fetches a book it
already has data for, so it's safe to re-run after a partial failure.

Run it directly from the command line:

```bash
npm run seed --prefix backend
```

...or trigger it over HTTP once the backend is running (this is what a real
admin panel would call — there's no UI for it, it's intentionally hidden):

```bash
curl -X POST http://localhost:4000/api/seed \
  -H "Content-Type: application/json" \
  -d '{"password":"<ADMIN_PASSWORD>"}'
```

Check progress:

```bash
curl http://localhost:4000/api/seed/status
```

A full run against ~99 titles takes a while (Reddit searches + two Claude
calls per book, each spaced 1 second apart) — expect it to run for tens of
minutes. Progress is safe to poll; re-running after an interruption resumes
where it left off.

## Notes on deployment

This prototype is structured to build cleanly with Vite for static hosting
(Vercel/Netlify), but the SQLite file is **not** appropriate for serverless
deployment as-is — serverless functions don't share a persistent filesystem,
so writes (including the pipeline) would be lost between invocations. For an
actual deployment, either:

- run the backend as a persistent Node process (e.g. Fly.io, Render, a small
  VPS) and point the frontend's `/api` proxy at it, or
- swap SQLite for a hosted database (Turso/libSQL, Postgres) before deploying
  the backend to a serverless platform.

For local development and demoing, the current setup works as-is.
