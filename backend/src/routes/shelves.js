import { Router } from 'express';
import { getAllBooks } from '../db/booksRepo.js';

const router = Router();
const SHELF_SIZE = 12;

function topBy(books, keyFn, count = SHELF_SIZE) {
  return [...books]
    .filter((b) => keyFn(b) != null)
    .sort((a, b) => keyFn(b) - keyFn(a))
    .slice(0, count);
}

router.get('/', (req, res) => {
  const all = getAllBooks();

  const shelves = [
    {
      key: 'best-reviewed',
      title: 'Highest quality scores',
      books: topBy(all, (b) => b.overall_score),
    },
    {
      key: 'trending',
      title: 'Trending now',
      books: topBy(all, (b) => b.hardcover_ratings_count),
    },
    {
      key: 'new-releases',
      title: 'New releases',
      books: topBy(all, (b) => (b.publication_date ? Date.parse(b.publication_date) : null)),
    },
    {
      key: 'lgbtq',
      title: 'LGBTQ+ picks',
      books: topBy(
        all.filter((b) => b.lgbtq === 'yes'),
        (b) => b.overall_score
      ),
    },
  ].filter((shelf) => shelf.books.length > 0);

  res.json({ shelves });
});

export default router;
