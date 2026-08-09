import 'dotenv/config';
import db from '../db/index.js';
import { processBook } from './runPipeline.js';
import { log } from './util.js';

// Second repair round: 2 more books silently matched to a bundle/omnibus
// product instead of the standalone single-book edition — the original
// WRONG_PRODUCT_PATTERN (see googleBooks.js) caught "box set"/"omnibus"/etc.
// but missed "trilogy"/"duology" as bundle-naming conventions, now fixed
// there. Same reset-and-reprocess approach as repairBadMatches.js.

const BAD_MATCH_IDS = [167]; // The Six of Crows Duology — retry after a transient Google Books 503 left it blank

const resetBook = db.prepare(`
  UPDATE books SET
    google_books_id = NULL,
    title = NULL,
    author = NULL,
    publisher = NULL,
    publication_date = NULL,
    page_count = NULL,
    description = NULL,
    cover_url = NULL,
    google_books_link = NULL,
    avg_rating = NULL,
    ratings_count = NULL,
    editorial_review = NULL,
    series_name = NULL,
    series_position = NULL,
    series_total = NULL,
    series_complete = NULL,
    series_titles = NULL,
    next_release_date = NULL,
    series_status = NULL,
    age_category = NULL,
    publisher_type = NULL,
    synopsis = NULL,
    praise = '[]',
    subgenre = NULL,
    romance_tropes = '[]',
    plot_tropes = '[]',
    spice_level = NULL,
    darkness_level = NULL,
    lgbtq = NULL,
    content_warnings = '[]',
    emotional_tone = NULL,
    pacing = NULL,
    tagging_confidence = NULL,
    google_books_fetched_at = NULL,
    reddit_fetched_at = NULL,
    hardcover_fetched_at = NULL,
    hardcover_avg_rating = NULL,
    hardcover_ratings_count = NULL,
    hardcover_cover_url = NULL,
    hardcover_url = NULL,
    tagged_at = NULL,
    quality_synthesized_at = NULL,
    updated_at = datetime('now')
  WHERE id = ?
`);

const deleteReviews = db.prepare(`DELETE FROM reviews WHERE book_id = ?`);
const deleteQualityProfile = db.prepare(`DELETE FROM quality_profiles WHERE book_id = ?`);
const selectSeed = db.prepare(`SELECT id, seed_title, seed_author FROM books WHERE id = ?`);

async function main() {
  for (const id of BAD_MATCH_IDS) {
    const row = selectSeed.get(id);
    if (!row) {
      log(`Book id ${id} not found — skipping`);
      continue;
    }
    log(`Resetting "${row.seed_title}" (id ${id})`);
    resetBook.run(id);
    deleteReviews.run(id);
    deleteQualityProfile.run(id);

    log(`Reprocessing "${row.seed_title}" by ${row.seed_author}`);
    await processBook({ title: row.seed_title, author: row.seed_author });
  }
  log('Repair run complete.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
