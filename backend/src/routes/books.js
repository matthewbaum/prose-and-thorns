import { Router } from 'express';
import { getAllBooks, getBookById } from '../db/booksRepo.js';
import { applyFilters, applySort } from '../lib/filterBooks.js';

const router = Router();

router.get('/', (req, res) => {
  const all = getAllBooks();
  const filtered = applyFilters(all, req.query);
  const sorted = applySort(filtered, req.query.sort);
  res.json({ books: sorted, total: sorted.length });
});

router.get('/:id', (req, res) => {
  const book = getBookById(Number(req.params.id));
  if (!book) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }
  res.json(book);
});

export default router;
