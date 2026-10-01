import 'dotenv/config';
import fs from 'node:fs';
import db from '../db/index.js';
import { fetchGoogleBooksData } from './googleBooks.js';
import { findOrCreateBook, saveGoogleBooksData, getReviewsForBook, saveQualityProfile } from '../db/pipelineRepo.js';
import { synthesizeQuality } from './claudeSynthesis.js';
import { sleep, RATE_LIMIT_DELAY_MS, log } from './util.js';

// Batch add: 8 paranormal-romance/urban-fantasy series (89 main-numbered
// novels total), sourced the same way as the earlier 6-title bolstering run
// -- Google Books for metadata, UCSD Goodreads dataset for review text and
// quality-profile synthesis, no Hardcover API calls. Same informed,
// user-confirmed exception to this project's "never Goodreads/StoryGraph"
// stance as that earlier run.

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
  if (rated.length <= TOTAL_SAMPLE_TARGET) return rated;
  const banded = RATING_BUCKETS.map((b) => rated.filter((r) => r.rating >= b.min && r.rating < b.max));
  const quotas = computeBandQuotas(banded.map((b) => b.length));
  const sampled = [];
  for (let i = 0; i < banded.length; i++) {
    const bandSorted = [...banded[i]].sort((a, b) => (b.n_votes || 0) - (a.n_votes || 0));
    sampled.push(...bandSorted.slice(0, quotas[i]));
  }
  return sampled;
}

const insertReview = db.prepare(
  `INSERT OR IGNORE INTO reviews (book_id, source, subreddit, author, text, score, url, permalink)
   VALUES (@book_id, 'ucsd', NULL, @author, @text, @score, NULL, NULL)`
);
const updateSeriesInfo = db.prepare(
  `UPDATE books SET series_name = @series_name, series_position = @series_position,
    series_total = COALESCE(@series_total, series_total), updated_at = datetime('now') WHERE id = @id`
);

// Established earlier this session via direct Goodreads verification; left
// null (not guessed) for series whose true total wasn't separately confirmed.
const KNOWN_SERIES_TOTAL = {
  'Anita Blake': 30,
  'Guild Hunter': 13, // matches series_total already stored on existing Guild Hunter rows
  'Sookie Stackhouse': 13,
};

const SERIES_LIST = JSON.parse(fs.readFileSync('/tmp/goodreads-check/final-add-list.json', 'utf8'));

async function main() {
  const summary = [];

  for (const [seriesName, items] of Object.entries(SERIES_LIST)) {
    for (const item of items) {
      const title = item.title;
      const author = item.author;
      log(`\n=== ${seriesName} #${item.series_position}: "${title}" by ${author} (${item.review_count} UCSD reviews) ===`);

      const book = findOrCreateBook(title, author);

      let gb = null;
      try {
        gb = await fetchGoogleBooksData(title, author);
      } catch (err) {
        log(`  Google Books fetch failed: ${err.message}`);
      }
      await sleep(RATE_LIMIT_DELAY_MS);

      if (gb) {
        saveGoogleBooksData(book.id, gb);
        log(`  Google Books: matched "${gb.title}", cover=${gb.cover_url ? 'yes' : 'no'}`);
      } else {
        log(`  Google Books: no match -- proceeding with title/author/description blank`);
      }

      updateSeriesInfo.run({
        id: book.id,
        series_name: seriesName,
        series_position: Number(item.series_position),
        series_total: KNOWN_SERIES_TOTAL[seriesName] || null,
      });

      // Sample this book's UCSD reviews from the merged raw-reviews file if
      // present (the 6-title bolstering run's file -- only covers those 6
      // books), otherwise fetch fresh from the UCSD reviews-text files isn't
      // done here; review text for this batch was not pre-extracted, so this
      // script expects a per-series raw-reviews file prepared beforehand.
      const reviewsPath = `/tmp/goodreads-check/raw-reviews-for-add/${item.gr_book_id}.json`;
      if (!fs.existsSync(reviewsPath)) {
        log(`  NO REVIEW TEXT FILE FOUND for gr_book_id ${item.gr_book_id} -- skipping synthesis`);
        summary.push({ series: seriesName, position: item.series_position, title, author, status: 'no-review-text' });
        continue;
      }
      const bookReviews = JSON.parse(fs.readFileSync(reviewsPath, 'utf8'));
      const sampled = sampleByBand(bookReviews);
      let inserted = 0;
      for (const r of sampled) {
        const info = insertReview.run({
          book_id: book.id,
          author: r.user_id,
          text: r.text.trim(),
          score: `${r.rating}/5 stars, ${r.n_votes || 0} votes`,
        });
        if (info.changes > 0) inserted += 1;
      }
      log(`  sampled ${sampled.length}/${bookReviews.length} UCSD reviews, inserted ${inserted} new rows`);

      const combinedReviews = getReviewsForBook(book.id);
      const ratedPulled = bookReviews.filter((r) => r.rating > 0);
      const avgRating = ratedPulled.length
        ? Number((ratedPulled.reduce((s, r) => s + r.rating, 0) / ratedPulled.length).toFixed(2))
        : null;
      const ratingsCount = item.ratings_count || ratedPulled.length;

      try {
        const profile = await synthesizeQuality({
          title,
          author,
          avgRating,
          ratingsCount,
          reviews: combinedReviews,
        });
        if (profile) {
          saveQualityProfile(book.id, profile);
          log(`  saved quality profile -- confidence: ${profile.confidence}, review_count_used: ${profile.review_count_used}`);
          summary.push({
            series: seriesName,
            position: item.series_position,
            title,
            author,
            book_id: book.id,
            status: 'ok',
            confidence: profile.confidence,
            review_count_used: profile.review_count_used,
          });
        } else {
          log(`  synthesis returned nothing`);
          summary.push({ series: seriesName, position: item.series_position, title, author, status: 'synthesis-empty' });
        }
      } catch (err) {
        log(`  synthesis FAILED: ${err.message}`);
        summary.push({ series: seriesName, position: item.series_position, title, author, status: 'synthesis-failed', error: err.message });
      }
    }
  }

  const result = db.pragma('wal_checkpoint(TRUNCATE)');
  log(`\nWAL checkpoint: ${JSON.stringify(result)}`);
  fs.writeFileSync('/tmp/goodreads-check/add-series-summary.json', JSON.stringify(summary, null, 2));
  log(`Done. ${summary.filter((s) => s.status === 'ok').length}/${summary.length} succeeded.`);
}

main();
