import 'dotenv/config';
import fs from 'node:fs';
import db from '../db/index.js';
import { fetchGoogleBooksData } from './googleBooks.js';
import { findOrCreateBook, saveGoogleBooksData, getReviewsForBook, saveQualityProfile, saveTags } from '../db/pipelineRepo.js';
import { synthesizeQuality } from './claudeSynthesis.js';
import { tagBook } from './claudeTagging.js';
import { normalizeText } from './auditCatalog.js';
import { sleep, RATE_LIMIT_DELAY_MS, log } from './util.js';

// Bulk add from the UCSD Goodreads dataset (the >=200-written-reviews pool,
// already filtered for genre fit, duplicates, novellas, box sets, companions
// and foreign editions -- see backend/data/ucsd-run/). Same sourcing as the
// earlier UCSD runs: Google Books for metadata, UCSD review text for the
// quality profile (source='ucsd'), no Hardcover calls. Unlike
// addSeriesFromUcsd.js this also runs Claude tagging, verifies the Google
// Books match against the UCSD author (matching is title-only otherwise), and
// confirms every representative_quote is a substring of the stored reviews
// before keeping it.
//
// Usage: node addFromUcsdPool.js [batchSize=50]
// Resumable: progress lives in PROGRESS_PATH. Exit codes: 0 = batch done (more
// may remain), 10 = nothing left to do, 42 = Google Books quota exhausted.

process.env.PT_GB_SINGLE_QUERY = '1'; // see googleBooks.js: one query per book unless the first finds no match

const POOL_PATH = '/tmp/goodreads-check/pool-final.json';
const REVIEWS_DIR = '/tmp/goodreads-check/raw-reviews-for-add';
const PROGRESS_PATH = '/tmp/goodreads-check/run-progress.json';
const BATCH_SIZE = Number(process.argv[2] || 50);

const TOTAL_SAMPLE_TARGET = 60;
const MIN_PER_BAND = 2;
const RATING_BUCKETS = [
  { min: 0, max: 1.5 },
  { min: 1.5, max: 2.5 },
  { min: 2.5, max: 3.5 },
  { min: 3.5, max: 4.5 },
  { min: 4.5, max: 5.1 },
];
const DIMENSIONS = ['prose_quality', 'romance_quality', 'world_building', 'pacing_quality', 'emotional_payoff', 'character_depth'];

function computeBandQuotas(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return RATING_BUCKETS.map(() => 0);
  const floors = counts.map((c) => (c > 0 ? Math.min(MIN_PER_BAND, c) : 0));
  const reserved = floors.reduce((a, b) => a + b, 0);
  const remaining = Math.max(0, TOTAL_SAMPLE_TARGET - reserved);
  return counts.map((c, i) => Math.min(floors[i] + Math.round((remaining * c) / total), c));
}

// rating=0 (no star rating) is excluded from banding, as in the earlier runs.
function sampleByBand(reviews) {
  const rated = reviews.filter((r) => r.rating > 0 && r.text && r.text.trim());
  if (rated.length <= TOTAL_SAMPLE_TARGET) return rated;
  const banded = RATING_BUCKETS.map((b) => rated.filter((r) => r.rating >= b.min && r.rating < b.max));
  const quotas = computeBandQuotas(banded.map((b) => b.length));
  const sampled = [];
  for (let i = 0; i < banded.length; i++) {
    sampled.push(...[...banded[i]].sort((a, b) => (b.n_votes || 0) - (a.n_votes || 0)).slice(0, quotas[i]));
  }
  return sampled;
}

const nameTokens = (s) =>
  new Set(
    (s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  );
const authorsAgree = (a, b) => {
  const A = nameTokens(a), B = nameTokens(b);
  for (const w of A) if (B.has(w)) return true;
  return false;
};

const insertReview = db.prepare(
  `INSERT OR IGNORE INTO reviews (book_id, source, subreddit, author, text, score, url, permalink)
   VALUES (@book_id, 'ucsd', NULL, @author, @text, @score, NULL, NULL)`
);
const setSeries = db.prepare(
  `UPDATE books SET series_name = @series_name, series_position = @series_position, updated_at = datetime('now') WHERE id = @id`
);
const setUcsdAggregate = db.prepare(
  `UPDATE books SET ucsd_avg_rating = @avg, ucsd_ratings_count = @count, updated_at = datetime('now') WHERE id = @id`
);
const deleteBook = db.prepare('DELETE FROM books WHERE id = ?');

function isQuotaError(err) {
  const m = String(err?.message || '');
  return /Google Books API error (429|403)/.test(m) && /quota|rate ?limit|RESOURCE_EXHAUSTED|Too Many/i.test(m);
}

function ungroundedDimensions(profile, reviews) {
  const texts = reviews.map((r) => normalizeText(r.text));
  const bad = [];
  for (const dim of DIMENSIONS) {
    const q = profile[dim]?.representative_quote;
    if (!q || !q.trim()) continue;
    const nq = normalizeText(q);
    if (!texts.some((t) => t.includes(nq))) bad.push(dim);
  }
  return bad;
}

const pool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8')).sort((a, b) => b.review_count - a.review_count);
const progress = fs.existsSync(PROGRESS_PATH) ? JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8')) : { done: {} };
const save = () => fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));

async function processBook(item) {
  const { title, author } = item;
  log(`\n=== "${title}" by ${author} (${item.series_name ? `${item.series_name} #${item.series_position}, ` : ''}${item.review_count} UCSD reviews) ===`);

  const reviewsPath = `${REVIEWS_DIR}/${item.gr_book_id}.json`;
  if (!fs.existsSync(reviewsPath)) return { status: 'skipped', reason: 'no-review-file' };
  const allReviews = JSON.parse(fs.readFileSync(reviewsPath, 'utf8'));

  // 5xx / network blips are transient: retry once after a pause (each attempt spends
  // daily Google Books quota, so retrying hard burned about half of it), and if they persist
  // leave the book un-recorded (so a later batch retries it) instead of
  // writing a permanent skip.
  let gb;
  for (let attempt = 0; ; attempt++) {
    try {
      gb = await fetchGoogleBooksData(title, author);
      break;
    } catch (err) {
      if (isQuotaError(err)) throw err;
      const transient = /Google Books API error 5\d\d|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|socket/i.test(err.message);
      if (!transient) return { status: 'skipped', reason: `google-books-error: ${err.message.slice(0, 120)}` };
      if (attempt >= 1) throw Object.assign(new Error(`transient: ${err.message.slice(0, 100)}`), { transient: true });
      await sleep(15000);
    }
  }
  await sleep(RATE_LIMIT_DELAY_MS);
  if (!gb) return { status: 'skipped', reason: 'no-google-books-match' };
  if (!authorsAgree(author, gb.author)) {
    return { status: 'skipped', reason: `google-books-author-mismatch (got "${gb.author}", "${gb.title}")` };
  }
  // Title check too: a same-author sibling ("Awaken" for "Abandon") passes the
  // author test but is the wrong book, and would get its description tagged.
  if (![...nameTokens(title)].some((w) => nameTokens(gb.title).has(w))) {
    return { status: 'skipped', reason: `google-books-title-mismatch (got "${gb.title}")` };
  }
  if (!gb.description) return { status: 'skipped', reason: 'no-description-for-tagging' };

  const existing = db.prepare('SELECT id FROM books WHERE google_books_id = ?').get(gb.google_books_id);
  if (existing) return { status: 'skipped', reason: `already-in-catalog-as-#${existing.id}` };

  const book = findOrCreateBook(title, author);
  saveGoogleBooksData(book.id, gb);

  const rated = allReviews.filter((r) => r.rating > 0);
  setUcsdAggregate.run({
    id: book.id,
    avg: rated.length ? Number((rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(2)) : null,
    count: item.ratings_count || rated.length,
  });

  try {
    const tags = await tagBook({ title, author, description: gb.description, editorialReview: gb.editorial_review });
    if (tags) saveTags(book.id, tags);
  } catch (err) {
    log(`  tagging failed: ${err.message}`);
  }
  // UCSD's parse of the series marker is more reliable than a model's guess.
  if (item.series_name) {
    setSeries.run({ id: book.id, series_name: item.series_name, series_position: Number(item.series_position) });
  }

  const sampled = sampleByBand(allReviews);
  for (const r of sampled) {
    insertReview.run({ book_id: book.id, author: r.user_id, text: r.text.trim(), score: `${r.rating}/5 stars, ${r.n_votes || 0} votes` });
  }
  const reviews = getReviewsForBook(book.id);
  log(`  sampled ${sampled.length}/${allReviews.length} reviews`);

  const synth = () =>
    synthesizeQuality({
      title,
      author,
      avgRating: rated.length ? Number((rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(2)) : null,
      ratingsCount: item.ratings_count || rated.length,
      reviews,
    });
  let profile = await synth();
  if (!profile) return { status: 'failed', reason: 'synthesis-empty', book_id: book.id };

  // Quote grounding: retry once, then drop (never store) an unverifiable quote.
  let bad = ungroundedDimensions(profile, reviews);
  if (bad.length) {
    log(`  ungrounded quotes in ${bad.join(', ')} -- resynthesizing once`);
    const retry = await synth();
    if (retry) profile = retry;
    bad = ungroundedDimensions(profile, reviews);
    for (const dim of bad) {
      log(`  dropping ungrounded quote for ${dim}`);
      profile[dim].representative_quote = '';
    }
  }
  saveQualityProfile(book.id, profile);
  log(`  saved profile (confidence ${profile.confidence}, review_count_used ${profile.review_count_used})`);
  return { status: 'ok', book_id: book.id, dropped_quotes: bad.length };
}

async function main() {
  const todo = pool.filter((b) => !progress.done[b.gr_book_id]);
  if (todo.length === 0) { log('Nothing left to do.'); process.exit(10); }
  log(`${todo.length} books remaining; processing up to ${BATCH_SIZE}.`);

  let n = 0;
  let transientStreak = 0;
  for (const item of todo.slice(0, BATCH_SIZE)) {
    try {
      progress.done[item.gr_book_id] = { title: item.title, author: item.author, ...(await processBook(item)) };
      transientStreak = 0;
    } catch (err) {
      if (err.transient) {
        transientStreak += 1;
        log(`  ${err.message} -- will retry later (${transientStreak} in a row)`);
        if (transientStreak >= 5) { save(); db.pragma('wal_checkpoint(TRUNCATE)'); process.exit(43); }
        continue;
      }
      if (isQuotaError(err)) {
        log(`Google Books quota exhausted: ${err.message.slice(0, 160)}`);
        save();
        db.pragma('wal_checkpoint(TRUNCATE)');
        process.exit(42);
      }
      log(`  FAILED: ${err.message}`);
      progress.done[item.gr_book_id] = { title: item.title, author: item.author, status: 'failed', reason: err.message.slice(0, 200) };
    }
    save();
    n += 1;
    await sleep(RATE_LIMIT_DELAY_MS);
  }
  db.pragma('wal_checkpoint(TRUNCATE)');
  const tally = {};
  for (const v of Object.values(progress.done)) tally[v.status] = (tally[v.status] || 0) + 1;
  log(`Batch complete (${n} processed). Overall: ${JSON.stringify(tally)}`);
  process.exit(0);
}

main();
