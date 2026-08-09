import 'dotenv/config';
import db from '../db/index.js';
import { processBook } from './runPipeline.js';
import { log } from './util.js';

// Third repair round: 5 books matched to completely unrelated old
// public-domain-era titles instead of the real contemporary book —
// verified cases: "The Film Weekly" (1955) for Danielle L. Jensen's real
// title, "The Law Times" (1888) and "The Friend" (1892) for two Caroline
// Peckham (Zodiac Academy) sequels, "Vicious Circle" by Manning Long
// (1953) for Caroline Peckham's same-titled novel, and a fan-made
// "reading journal" product for another Peckham title. All 5 surfaced via
// the zero-rating-substance query (auditCatalog.js's genre-fit sibling
// check) — Google Books' title search apparently returns weak results for
// some of these self-published titles, falling back to old unrelated
// matches sharing generic words. Same reset-and-reprocess approach as the
// prior two repair rounds.

const BAD_MATCH_IDS = [268, 269]; // "The Undying Empire", "Oathcrown" — wrong matches from the batch-3 run

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
