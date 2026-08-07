import { Router } from 'express';
import { getAllBooks } from '../db/booksRepo.js';
import { getRecommendations } from '../lib/similarity.js';

const router = Router();

router.get('/', (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v));

  if (ids.length === 0) {
    res.status(400).json({ error: 'Provide at least one book id via ?ids=' });
    return;
  }

  const all = getAllBooks();
  const seeds = all.filter((b) => ids.includes(b.id));
  if (seeds.length === 0) {
    res.status(404).json({ error: 'None of the given book ids were found' });
    return;
  }

  // No real reason to cap this artificially — with a ~100-book catalog the
  // full matched set is never unwieldy, and ranking already puts the best
  // matches first. Only honor an explicit ?limit= if the caller passes one.
  const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : Infinity;
  const mode = req.query.mode === 'all' ? 'all' : 'any';
  const { books, noCommonGround } = getRecommendations(all, seeds, limit, mode);

  res.json({
    books,
    mode,
    noCommonGround,
    seeds: seeds.map((s) => ({ id: s.id, title: s.title, author: s.author })),
  });
});

export default router;
