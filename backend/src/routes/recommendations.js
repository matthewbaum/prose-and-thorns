import { Router } from 'express';
import { getAllBooks } from '../db/booksRepo.js';
import { getRecommendations } from '../lib/similarity.js';
import { applySort } from '../lib/filterBooks.js';

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
  const { books, noCommonGround, commonGround } = getRecommendations(all, seeds, limit, mode);

  // 'match' (the default) keeps getRecommendations' own ranking — how well
  // each book fits the seeds. Any other value re-orders the same matched
  // set by a different signal (quality, popularity, etc.) without changing
  // which books qualified in the first place.
  const sort = req.query.sort;
  const sortedBooks = sort && sort !== 'match' ? applySort(books, sort) : books;

  res.json({
    books: sortedBooks,
    mode,
    noCommonGround,
    // Only meaningful in 'all' mode — the full basis of what the seeds
    // share, not just the elements that cleared the matching bar.
    commonGround: commonGround || [],
    seeds: seeds.map((s) => ({ id: s.id, title: s.title, author: s.author })),
  });
});

export default router;
