import 'dotenv/config';
import db from '../db/index.js';
import { processBook } from './runPipeline.js';
import { log } from './util.js';

// One-off repair: 8 books were silently matched to the wrong Google Books
// product (a box set, "deluxe illustrated" companion, or the wrong book in
// a series — e.g. "Caraval" matched to "Finale", book 3 of the same
// series). Because book.title feeds the Hardcover lookup, Claude tagging,
// and quality synthesis downstream, every derived field for these 8 is
// potentially wrong, not just the title — so this resets each row to a
// blank slate (seed_title/seed_author only) and reprocesses it through the
// full pipeline, now with the corrected Google Books matching logic in
// googleBooks.js.

const BAD_MATCH_IDS = [146, 147, 183, 185, 189, 194, 200, 205];

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
