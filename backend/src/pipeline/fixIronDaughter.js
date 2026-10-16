import 'dotenv/config';
import fs from 'node:fs';
import db from '../db/index.js';
import { tagBook } from './claudeTagging.js';
import { saveTags } from '../db/pipelineRepo.js';

// One-off: row #270 was seeded as "The Iron Daughter" (Iron Fey #2) but its Google/Hardcover
// match was the omnibus "The Iron Fey Volume One", so it showed the wrong title, cover,
// description and Hardcover reviews. Rebuild it from the UCSD record for the real book.
const m = JSON.parse(fs.readFileSync('/tmp/goodreads-check/pool-meta.json', 'utf8'))['7747064'];
const pad = (n) => String(n).padStart(2, '0');
const date = m.year ? (m.month && m.day ? `${m.year}-${pad(m.month)}-${pad(m.day)}` : String(m.year)) : null;
const description = m.description.replace(/<br\s*\/?>/gi, '\n').replace(/\s+\n/g, '\n').trim();
db.prepare(`UPDATE books SET title='The Iron Daughter', author='Julie Kagawa', publisher=?, publication_date=?, page_count=?, description=?,
  google_books_id=NULL, google_books_link=NULL, avg_rating=NULL, ratings_count=NULL, editorial_review=NULL,
  hardcover_avg_rating=NULL, hardcover_ratings_count=NULL, hardcover_cover_url=NULL, hardcover_url=NULL, cover_url=NULL,
  isbn=COALESCE(isbn, ?), quality_synthesized_at=NULL, updated_at=datetime('now') WHERE id=270`).run(m.publisher, date, m.num_pages, description, m.isbn13 || m.isbn);
db.prepare("DELETE FROM reviews WHERE book_id=270 AND source='hardcover'").run();
db.prepare('DELETE FROM quality_profiles WHERE book_id=270').run();
const tags = await tagBook({ title: 'The Iron Daughter', author: 'Julie Kagawa', description, editorialReview: null });
saveTags(270, tags);
db.prepare("UPDATE books SET series_name='The Iron Fey', series_position=2, updated_at=datetime('now') WHERE id=270").run();
db.pragma('wal_checkpoint(TRUNCATE)');
console.log('rebuilt #270; isbn', m.isbn13 || m.isbn, '| remaining reviews:', db.prepare('SELECT source, COUNT(*) n FROM reviews WHERE book_id=270 GROUP BY source').all());
