import 'dotenv/config';
import { SEED_BOOKS } from './seedList.js';
import { processBook } from './runPipeline.js';
import { log } from './util.js';
import db from '../db/index.js';

// Targeted re-run for the subset of books whose Hardcover reviews were wiped
// by the pre-batch reset in the proportional-sampling run but never replaced
// because that run tripped Hardcover's rate limit partway through (101 of
// 145 books ended with hardcover_fetched_at NULL and zero hardcover reviews).
// Reuses processBook's existing "never call twice" guards, so this is safe
// to run standalone — it just skips any book that already has fresh data.
// Match on seed_title, not the display title column — title gets overwritten
// by Google Books data (subtitle, edition name, etc.) and had drifted for 12
// of the 101 affected books, which silently excluded them when matched
// against SEED_BOOKS by display title (same class of bug as the earlier
// "The Nightingale" orphaned-seed-entry issue).
const missingSeedTitles = new Set(
  db
    .prepare('SELECT seed_title FROM books WHERE hardcover_fetched_at IS NULL')
    .all()
    .map((r) => r.seed_title)
);

const targets = SEED_BOOKS.filter((seed) => missingSeedTitles.has(seed.title));
log(`Reprocessing ${targets.length} books with missing Hardcover data`);

let done = 0;
for (const seed of targets) {
  try {
    await processBook(seed);
  } catch (err) {
    log(`Unexpected failure on "${seed.title}": ${err.message}`);
  }
  done += 1;
  if (done % 10 === 0) log(`Progress: ${done}/${targets.length}`);
}

log(`DONE. ${done} processed.`);
process.exit(0);
