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
import './db/index.js'; // ensures schema is created on boot

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api/books', booksRouter);
app.use('/api/seed', seedRouter);
app.use('/api/shelves', shelvesRouter);
app.use('/api/recommendations', recommendationsRouter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
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
