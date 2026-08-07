import 'dotenv/config';
import { readFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db/index.js';
import { synthesizeQuality } from './claudeSynthesis.js';
import { saveQualityProfile } from '../db/pipelineRepo.js';
import { log } from './util.js';

// Manual review ingestion — for books where the Reddit pipeline has no data.
// Drop a text file per book in data/manual-reviews/, named `<book_id>-anything.txt`,
// containing review text copied from Goodreads/StoryGraph/review blogs/etc.
//
// To mark distinct sources within one file (recommended — gives Claude more
// signal about how many independent voices it's reading), separate blocks with
// a line like:
//   ### SOURCE: Goodreads
//   <pasted reviews>
//   ### SOURCE: Fantasy Book Critic (blog)
//   <pasted review>
// A file with no ### SOURCE: markers is treated as one block.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REVIEWS_DIR = join(__dirname, '../../data/manual-reviews');

const selectBook = db.prepare('SELECT id, title, author, avg_rating, ratings_count FROM books WHERE id = ?');

function parseReviewFile(text) {
  const parts = text.split(/^### SOURCE:\s*(.+)$/m);
  if (parts.length === 1) {
    const body = text.trim();
    return body ? [{ source: 'manual paste', text: body }] : [];
  }
  const reviews = [];
  for (let i = 1; i < parts.length; i += 2) {
    const source = parts[i].trim();
    const body = (parts[i + 1] || '').trim();
    if (body) reviews.push({ source, text: body });
  }
  return reviews;
}

async function ingestOne(bookId, filePath) {
  const book = selectBook.get(bookId);
  if (!book) {
    log(`No book with id ${bookId} — skipping ${filePath}`);
    return;
  }

  const reviews = parseReviewFile(readFileSync(filePath, 'utf8'));
  if (reviews.length === 0) {
    log(`No review text found in ${filePath} — skipping`);
    return;
  }

  log(`Synthesizing "${book.title}" from ${reviews.length} pasted source(s)...`);
  let profile;
  try {
    profile = await synthesizeQuality({
      title: book.title,
      author: book.author,
      avgRating: book.avg_rating,
      ratingsCount: book.ratings_count,
      reviews,
    });
  } catch (err) {
    log(`Synthesis failed for "${book.title}": ${err.message} — skipping, file left in place for retry`);
    return;
  }

  if (!profile) {
    log(`Synthesis returned nothing for "${book.title}"`);
    return;
  }

  saveQualityProfile(bookId, profile);
  log(`Saved real quality profile for "${book.title}" — confidence: ${profile.confidence}, review_count_used: ${profile.review_count_used}`);
}

async function main() {
  mkdirSync(REVIEWS_DIR, { recursive: true });
  const files = readdirSync(REVIEWS_DIR).filter((f) => f.endsWith('.txt'));

  if (files.length === 0) {
    log(`No .txt files found in ${REVIEWS_DIR}.`);
    log('Add one per book, named "<book_id>-anything.txt" (e.g. "110-fourth-wing.txt").');
    return;
  }

  for (const file of files) {
    const bookId = Number(file.split('-')[0]);
    if (!Number.isInteger(bookId)) {
      log(`Skipping "${file}" — filename must start with the numeric book id, e.g. "110-fourth-wing.txt"`);
      continue;
    }
    try {
      await ingestOne(bookId, join(REVIEWS_DIR, file));
    } catch (err) {
      log(`Unexpected error on "${file}": ${err.message} — continuing with next file`);
    }
  }

  log('Manual review ingestion complete.');
}

main();
