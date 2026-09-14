import db from './index.js';

export const RETAILERS = ['bookshop', 'amazon', 'barnes-noble', 'google-books', 'audible'];

const insertClick = db.prepare('INSERT INTO retailer_clicks (book_id, retailer) VALUES (?, ?)');

export function logClick(bookId, retailer) {
  insertClick.run(bookId, retailer);
}

const totalsByRetailer = db.prepare(
  `SELECT retailer, COUNT(*) as clicks FROM retailer_clicks GROUP BY retailer ORDER BY clicks DESC`
);

// Grouped by (book_id, retailer), not just book_id -- a book-only total
// with a separate, independently-sorted retailer-totals table next to it
// invited misreading the two tables as row-paired (verified case: a user
// read "Amazon" and "Bookshop.org" as corresponding to whichever book
// happened to be listed in the same row position, when the two tables
// were unrelated). Each row here is now self-contained: book + retailer +
// count, no cross-table inference needed.
const topBooks = db.prepare(
  `SELECT rc.book_id, COALESCE(b.title, b.seed_title) as title, rc.retailer, COUNT(*) as clicks
   FROM retailer_clicks rc
   JOIN books b ON b.id = rc.book_id
   GROUP BY rc.book_id, rc.retailer
   ORDER BY clicks DESC, title ASC
   LIMIT 10`
);

export function getClickSummary() {
  return {
    byRetailer: totalsByRetailer.all(),
    topBooks: topBooks.all(),
  };
}
