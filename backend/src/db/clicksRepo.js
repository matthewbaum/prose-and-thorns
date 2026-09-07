import db from './index.js';

export const RETAILERS = ['bookshop', 'amazon', 'barnes-noble', 'google-books', 'audible'];

const insertClick = db.prepare('INSERT INTO retailer_clicks (book_id, retailer) VALUES (?, ?)');

export function logClick(bookId, retailer) {
  insertClick.run(bookId, retailer);
}

const totalsByRetailer = db.prepare(
  `SELECT retailer, COUNT(*) as clicks FROM retailer_clicks GROUP BY retailer ORDER BY clicks DESC`
);

const topBooks = db.prepare(
  `SELECT rc.book_id, COALESCE(b.title, b.seed_title) as title, COUNT(*) as clicks
   FROM retailer_clicks rc
   JOIN books b ON b.id = rc.book_id
   GROUP BY rc.book_id
   ORDER BY clicks DESC
   LIMIT 10`
);

export function getClickSummary() {
  return {
    byRetailer: totalsByRetailer.all(),
    topBooks: topBooks.all(),
  };
}
