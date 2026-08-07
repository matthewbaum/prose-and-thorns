import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db/index.js';
import { log } from './util.js';

// One-time migration: fold the already-collected blog review text (living
// only in data/manual-reviews/*.txt, written straight to quality_profiles by
// ingestManualReviews.js) into the reviews table as source='blog_review', so
// it sits alongside hardcover reviews and both feed one combined synthesis
// call per book via the normal pipeline path.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REVIEWS_DIR = join(__dirname, '../../data/manual-reviews');

const insertReview = db.prepare(
  `INSERT OR IGNORE INTO reviews (book_id, source, subreddit, author, text, score, url, permalink)
   VALUES (@book_id, 'blog_review', NULL, @author, @text, NULL, NULL, NULL)`
);

function parseReviewFile(text) {
  const parts = text.split(/^### SOURCE:\s*(.+)$/m);
  if (parts.length === 1) {
    const body = text.trim();
    return body ? [{ author: 'manual paste', text: body }] : [];
  }
  const reviews = [];
  for (let i = 1; i < parts.length; i += 2) {
    const author = parts[i].trim();
    const body = (parts[i + 1] || '').trim();
    if (body) reviews.push({ author, text: body });
  }
  return reviews;
}

function main() {
  const files = readdirSync(REVIEWS_DIR).filter((f) => f.endsWith('.txt'));
  let totalRows = 0;

  for (const file of files) {
    const bookId = Number(file.split('-')[0]);
    if (!Number.isInteger(bookId)) continue;
    const reviews = parseReviewFile(readFileSync(join(REVIEWS_DIR, file), 'utf8'));
    for (const r of reviews) {
      insertReview.run({ book_id: bookId, author: r.author, text: r.text });
      totalRows += 1;
    }
    log(`Migrated ${reviews.length} blog source(s) for book ${bookId} (${file})`);
  }

  log(`Done — ${totalRows} blog review rows migrated from ${files.length} files.`);
}

main();
