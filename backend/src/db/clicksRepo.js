import db from './index.js';
import liveDb from './liveDb.js';

export const RETAILERS = ['bookshop', 'amazon', 'barnes-noble', 'google-books', 'audible'];

const insertClick = liveDb.prepare('INSERT INTO retailer_clicks (book_id, retailer) VALUES (?, ?)');

export function logClick(bookId, retailer) {
  insertClick.run(bookId, retailer);
}

const totalsByRetailer = liveDb.prepare(
  `SELECT retailer, COUNT(*) as clicks FROM retailer_clicks GROUP BY retailer ORDER BY clicks DESC`
);

// Grouped by (book_id, retailer), not just book_id -- a book-only total
// with a separate, independently-sorted retailer-totals table next to it
// invited misreading the two tables as row-paired (verified case: a user
// read "Amazon" and "Bookshop.org" as corresponding to whichever book
// happened to be listed in the same row position, when the two tables
// were unrelated). Each row here is now self-contained: book + retailer +
// count, no cross-table inference needed.
// Clicks live in the live-data database and titles in the catalog one, so the
// per-book join happens here in JS rather than in SQL.
const topBookClicks = liveDb.prepare(
  `SELECT book_id, retailer, COUNT(*) as clicks
   FROM retailer_clicks
   GROUP BY book_id, retailer
   ORDER BY clicks DESC, book_id ASC
   LIMIT 10`
);
const titleById = db.prepare('SELECT COALESCE(title, seed_title) AS title FROM books WHERE id = ?');

export function getClickSummary() {
  return {
    byRetailer: totalsByRetailer.all(),
    topBooks: topBookClicks.all().map((r) => ({ ...r, title: titleById.get(r.book_id)?.title ?? '(removed)' })),
  };
}
