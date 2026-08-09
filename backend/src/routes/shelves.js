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

// The catalog deliberately includes some fantasy that isn't pure romantasy
// (broader discovery adjacency) — that's fine for search/browse, but every
// shelf here is an unprompted, day-one-visible homepage surface (the first
// shelf's books also feed the hero cover cluster, the very first thing a
// visitor sees). A thin-romance book can still score well on craft alone
// or have real popularity (verified cases: Circe/The Song of Achilles/The
// Bear and the Nightingale scored high enough for "Highest quality
// scores"; The Midnight Library/The Name of the Wind had enough Hardcover
// ratings for "Trending now") — so every shelf pulls from the same
// genre-relevance floor, not to exclude these books from the catalog, just
// from being what a first-time visitor sees before they understand what
// the app is. Same threshold as auditCatalog.js's genre-fit check.
function isFeaturableRomantasy(book) {
  return (book.romance_tropes || []).length > 2;
}

router.get('/', (req, res) => {
  const all = getAllBooks();
  const featurable = all.filter(isFeaturableRomantasy);

  const shelves = [
    {
      key: 'best-reviewed',
      title: 'Highest quality scores',
      books: topBy(featurable, (b) => b.overall_score),
    },
    {
      key: 'trending',
      title: 'Trending now',
      books: topBy(featurable, (b) => b.hardcover_ratings_count),
    },
    {
      key: 'new-releases',
      title: 'New releases',
      books: topBy(featurable, (b) => (b.publication_date ? Date.parse(b.publication_date) : null)),
    },
    {
      key: 'lgbtq',
      title: 'LGBTQ+ picks',
      books: topBy(
        featurable.filter((b) => b.lgbtq === 'yes'),
        (b) => b.overall_score
      ),
    },
  ].filter((shelf) => shelf.books.length > 0);

  res.json({ shelves });
});

export default router;
