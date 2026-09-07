import { Router } from 'express';
import { getAllBooks, getBookById } from '../db/booksRepo.js';
import { applyFilters, applySort } from '../lib/filterBooks.js';
import { logClick, RETAILERS } from '../db/clicksRepo.js';

const router = Router();

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

router.get('/', (req, res) => {
  const all = getAllBooks();
  const filtered = applyFilters(all, req.query);
  const sorted = applySort(filtered, req.query.sort);

  const limit = Math.min(Number(req.query.limit) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const page = sorted.slice(offset, offset + limit);

  res.json({ books: page, total: sorted.length, limit, offset });
});

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) {
    res.json({ books: [] });
    return;
  }
  const matches = getAllBooks()
    .filter((b) => (b.title || '').toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q))
    .slice(0, 10)
    .map((b) => ({ id: b.id, title: b.title, author: b.author, cover_url: b.cover_url }));
  res.json({ books: matches });
});

router.get('/:id', (req, res) => {
  const book = getBookById(Number(req.params.id));
  if (!book) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }
  res.json(book);
});

// Fire-and-forget from the frontend right as a retailer link opens in a new
// tab -- no auth, no PII, just enough to tell which retailers actually get
// used per book (see retailer_clicks in schema.js for why this exists).
router.post('/:id/click', (req, res) => {
  const bookId = Number(req.params.id);
  const { retailer } = req.body || {};
  if (!RETAILERS.includes(retailer)) {
    res.status(400).json({ error: `retailer must be one of: ${RETAILERS.join(', ')}` });
    return;
  }
  if (!getBookById(bookId)) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }
  logClick(bookId, retailer);
  res.status(204).end();
});

export default router;
