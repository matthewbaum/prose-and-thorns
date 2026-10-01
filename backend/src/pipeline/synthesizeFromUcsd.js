import 'dotenv/config';
import fs from 'node:fs';
import db from '../db/index.js';
import { getReviewsForBook, saveQualityProfile } from '../db/pipelineRepo.js';
import { synthesizeQuality } from './claudeSynthesis.js';
import { log } from './util.js';

// Pilot: synthesize quality profiles for a handful of thin-Hardcover-coverage
// titles using review text from the UCSD Goodreads dataset (academic-only
// license -- see conversation record; proceeding was an explicit, informed
// user decision given this project's earlier "never Goodreads/StoryGraph,
// per the ToS discussion" stance in enrichThinBooksWebSearch.js). No
// Hardcover API calls are made here.

// Same banding approach as hardcover.js's computeBandQuotas, just with a
// 60-review target instead of 40 (per this run's explicit instruction) and
// adapted for UCSD's plain 1-5 integer ratings instead of Hardcover's
// fractional ones. rating=0 (shelved/reviewed with no star rating) is
// excluded from banding entirely -- bucketing it into the "0-1.5" band would
// misrepresent an unrated review as a 1-star negative one.
const TOTAL_SAMPLE_TARGET = 60;
const MIN_PER_BAND = 2;
const RATING_BUCKETS = [
  { min: 0, max: 1.5 },
  { min: 1.5, max: 2.5 },
  { min: 2.5, max: 3.5 },
  { min: 3.5, max: 4.5 },
  { min: 4.5, max: 5.1 },
];

function computeBandQuotas(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return RATING_BUCKETS.map(() => 0);
  const floors = counts.map((c) => (c > 0 ? Math.min(MIN_PER_BAND, c) : 0));
  const reserved = floors.reduce((a, b) => a + b, 0);
  const remaining = Math.max(0, TOTAL_SAMPLE_TARGET - reserved);
  return counts.map((c, i) => {
    const share = total > 0 ? Math.round((remaining * c) / total) : 0;
    return Math.min(floors[i] + share, c);
  });
}

function sampleByBand(reviews) {
  const rated = reviews.filter((r) => r.rating > 0 && r.text && r.text.trim());
  const banded = RATING_BUCKETS.map((b) => rated.filter((r) => r.rating >= b.min && r.rating < b.max));
  if (rated.length <= TOTAL_SAMPLE_TARGET) return rated;
  const counts = banded.map((b) => b.length);
  const quotas = computeBandQuotas(counts);
  const sampled = [];
  for (let i = 0; i < banded.length; i++) {
    // Highest n_votes first within a band, same "most substantive signal
    // first" rationale as hardcover.js's likes_count ordering.
    const bandSorted = [...banded[i]].sort((a, b) => (b.n_votes || 0) - (a.n_votes || 0));
    sampled.push(...bandSorted.slice(0, quotas[i]));
  }
  return sampled;
}

const insertReview = db.prepare(
  `INSERT OR IGNORE INTO reviews (book_id, source, subreddit, author, text, score, url, permalink)
   VALUES (@book_id, 'ucsd', NULL, @author, @text, @score, NULL, NULL)`
);

const selectBook = db.prepare('SELECT id, title, author, avg_rating, ratings_count FROM books WHERE id = ?');

const TARGETS = [
  { catalog_id: 316, gr_book_id: '13618440' },
  { catalog_id: 272, gr_book_id: '9659607' },
  { catalog_id: 396, gr_book_id: '28260402' },
  { catalog_id: 366, gr_book_id: '23197122' },
  { catalog_id: 367, gr_book_id: '25714091' },
  { catalog_id: 368, gr_book_id: '26877925' },
]; // gr_ratings_count pulled directly from the earlier catalog-matches scan output
// (/tmp/goodreads-check/catalog-matches-*.json) for each book's best-matched
// GR edition -- not estimated or invented.
const GR_RATINGS_COUNT = {
  '13618440': 49198,
  '9659607': 65383,
  '28260402': 3393,
  '23197122': 502,
  '25714091': 116,
  '26877925': 63,
};

const allUcsdReviews = JSON.parse(fs.readFileSync('/tmp/goodreads-check/raw-reviews-merged.json', 'utf8'));

async function main() {
  for (const t of TARGETS) {
    const book = selectBook.get(t.catalog_id);
    if (!book) {
      log(`No book #${t.catalog_id} -- skipping`);
      continue;
    }

    const forThisBook = allUcsdReviews.filter((r) => r.book_id === t.gr_book_id);
    const sampled = sampleByBand(forThisBook);
    log(`#${t.catalog_id} "${book.title}": ${forThisBook.length} UCSD reviews available, sampling ${sampled.length}`);

    let inserted = 0;
    for (const r of sampled) {
      const info = insertReview.run({
        book_id: t.catalog_id,
        author: r.user_id,
        text: r.text.trim(),
        score: `${r.rating}/5 stars, ${r.n_votes || 0} votes`,
      });
      if (info.changes > 0) inserted += 1;
    }
    log(`  inserted ${inserted} new ucsd review rows (source='ucsd')`);

    const combinedReviews = getReviewsForBook(t.catalog_id);
    log(`  combined review pool for synthesis: ${combinedReviews.length} rows (all sources)`);

    const ratedPulled = forThisBook.filter((r) => r.rating > 0);
    const avgRating = book.avg_rating ?? (ratedPulled.length
      ? Number((ratedPulled.reduce((s, r) => s + r.rating, 0) / ratedPulled.length).toFixed(2))
      : null);
    const ratingsCount = book.ratings_count ?? GR_RATINGS_COUNT[t.gr_book_id] ?? ratedPulled.length;

    try {
      const profile = await synthesizeQuality({
        title: book.title,
        author: book.author,
        avgRating,
        ratingsCount,
        reviews: combinedReviews,
      });
      if (profile) {
        saveQualityProfile(t.catalog_id, profile);
        log(`  saved quality profile -- confidence: ${profile.confidence}, review_count_used: ${profile.review_count_used}`);
      } else {
        log(`  synthesis returned nothing for #${t.catalog_id}`);
      }
    } catch (err) {
      log(`  synthesis FAILED for #${t.catalog_id}: ${err.message}`);
    }
  }

  const result = db.pragma('wal_checkpoint(TRUNCATE)');
  log(`WAL checkpoint: ${JSON.stringify(result)}`);
  log('Done.');
}

main();
