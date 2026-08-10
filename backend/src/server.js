import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import booksRouter from './routes/books.js';
import seedRouter from './routes/seed.js';
import shelvesRouter from './routes/shelves.js';
import recommendationsRouter from './routes/recommendations.js';
import submissionsRouter from './routes/submissions.js';
import db from './db/index.js'; // ensures schema is created on boot

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Without an explicit Cache-Control, Express's default ETag can still leave
// browsers free to heuristically cache these responses — the catalog data
// changes from pipeline runs independent of any client action, so API
// responses should never be served stale from cache.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use('/api/books', booksRouter);
app.use('/api/seed', seedRouter);
app.use('/api/shelves', shelvesRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/submissions', submissionsRouter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// TEMPORARY — deploy diagnostic, to be removed once the stale-deploy
// investigation is resolved. Reports what's actually on disk in the
// running container, independent of any app-level query logic.
app.get('/api/_debug', (req, res) => {
  const dbPath = path.join(__dirname, '..', 'data', 'prose-and-thorns.sqlite');
  const stat = fs.statSync(dbPath);
  const bookCount = db.prepare('SELECT COUNT(*) as n FROM books').get().n;
  const hasStarlightHeir = db.prepare("SELECT COUNT(*) as n FROM books WHERE seed_title = 'The Starlight Heir'").get().n;
  res.json({
    dbFileSizeBytes: stat.size,
    dbFileMtime: stat.mtime,
    bookCountRaw: bookCount,
    hasStarlightHeir: hasStarlightHeir > 0,
  });
});

// In production, the frontend is built into ../../frontend/dist and served
// directly from this same process — one deployable service, not two. In dev,
// the Vite dev server handles the frontend separately (see vite.config.js
// proxy), so this directory won't exist and we skip straight to listen().
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Prose & Thorns API listening on http://localhost:${PORT}`);
});
