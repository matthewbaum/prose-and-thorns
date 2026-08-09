import 'dotenv/config';
import db from '../db/index.js';
import { synthesizeQuality } from './claudeSynthesis.js';
import { getReviewsForBook, saveQualityProfile } from '../db/pipelineRepo.js';
import { log, sleep, RATE_LIMIT_DELAY_MS } from './util.js';

// Audit flagged 10 representative_quote values across 7 books as not a
// substring of any stored review. Spot-checking book 114 confirmed these
// are real reviews very lightly paraphrased (e.g. stored review says
// 'Yes!' with one exclamation point, synthesized quote says 'Yes!!') —
// generated before this session's SYNTHESIS_PROMPT fix required a true
// verbatim excerpt. Resynthesizing against the same review text with the
// now-fixed prompt should produce a genuinely grounded quote. Only
// clearing quality_synthesized_at + the quality_profiles row — Google
// Books/Hardcover/Reddit data for these books is fine and untouched.

const FLAGGED_BOOK_IDS = [114, 191, 244, 295, 318, 346, 370];

const selectBook = db.prepare('SELECT id, title, seed_title, author, seed_author, avg_rating, ratings_count, hardcover_avg_rating, hardcover_ratings_count FROM books WHERE id = ?');
const clearSynthesized = db.prepare('UPDATE books SET quality_synthesized_at = NULL WHERE id = ?');
const deleteProfile = db.prepare('DELETE FROM quality_profiles WHERE book_id = ?');

async function main() {
  for (const id of FLAGGED_BOOK_IDS) {
    const book = selectBook.get(id);
    if (!book) {
      log(`Book id ${id} not found — skipping`);
      continue;
    }
    const displayTitle = book.title || book.seed_title;
    const displayAuthor = book.author || book.seed_author;
    log(`Resynthesizing "${displayTitle}" (id ${id})`);

    clearSynthesized.run(id);
    deleteProfile.run(id);

    const reviews = getReviewsForBook(id);
    const anchorRating = book.hardcover_avg_rating ?? book.avg_rating;
    const anchorRatingsCount = book.hardcover_avg_rating != null ? book.hardcover_ratings_count : book.ratings_count;

    try {
      const profile = await synthesizeQuality({
        title: displayTitle,
        author: displayAuthor,
        avgRating: anchorRating,
        ratingsCount: anchorRatingsCount,
        reviews,
      });
      if (profile) {
        saveQualityProfile(id, profile);
        log(`Saved new profile for "${displayTitle}"`);
      } else {
        log(`No reviews available to synthesize quality for "${displayTitle}"`);
      }
    } catch (err) {
      log(`Synthesis failed for "${displayTitle}": ${err.message}`);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }
  log('Resynthesis run complete.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
