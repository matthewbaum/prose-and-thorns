import 'dotenv/config';
import { synthesizeQuality } from './claudeSynthesis.js';
import { getReviewsForBook, saveQualityProfile } from '../db/pipelineRepo.js';
import { sleep, RATE_LIMIT_DELAY_MS, log } from './util.js';
import db from '../db/index.js';

// Synthesis-only retry for books whose Hardcover fetch already succeeded
// (fresh proportional-sample reviews on disk) but whose synthesis call
// failed — mainly the 29 books hit by a mid-run Anthropic credit exhaustion
// during the reprocessMissingHardcover run. No need to re-fetch anything.
const targets = db
  .prepare(
    `SELECT id, title, author, hardcover_avg_rating, hardcover_ratings_count, avg_rating, ratings_count
     FROM books
     WHERE quality_synthesized_at IS NULL
     AND EXISTS (SELECT 1 FROM reviews r WHERE r.book_id = books.id)`
  )
  .all();

log(`Synthesizing quality for ${targets.length} books`);

let done = 0;
for (const book of targets) {
  try {
    const reviews = getReviewsForBook(book.id);
    const anchorRating = book.hardcover_avg_rating ?? book.avg_rating;
    const anchorRatingsCount = book.hardcover_avg_rating != null ? book.hardcover_ratings_count : book.ratings_count;
    const profile = await synthesizeQuality({
      title: book.title,
      author: book.author,
      avgRating: anchorRating,
      ratingsCount: anchorRatingsCount,
      reviews,
    });
    if (profile) {
      saveQualityProfile(book.id, profile);
    } else {
      log(`No reviews available to synthesize quality for "${book.title}"`);
    }
  } catch (err) {
    log(`Synthesis failed for "${book.title}": ${err.message}`);
  }
  await sleep(RATE_LIMIT_DELAY_MS);
  done += 1;
  if (done % 10 === 0) log(`Progress: ${done}/${targets.length}`);
}

log(`DONE. ${done} processed.`);
process.exit(0);
