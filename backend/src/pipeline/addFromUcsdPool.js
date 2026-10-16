import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

// ---- Google availability (shared across batch processes via a small state file) ----
const GOOGLE_DOWN_PATH = '/tmp/goodreads-check/google-down-until.txt';
function googleAvailable() {
  try {
    return Date.now() >= Number(fs.readFileSync(GOOGLE_DOWN_PATH, 'utf8'));
  } catch {
    return true;
  }
}
function markGoogleDown(ms, why) {
  fs.writeFileSync(GOOGLE_DOWN_PATH, String(Date.now() + ms));
  log(`  Google Books ${why}; using UCSD metadata for ${Math.round(ms / 60000)} min`);
}
// Google's daily quota resets at midnight Pacific (07:00 UTC in daylight time).
function msUntilQuotaReset() {
  const next = new Date();
  next.setUTCHours(7, 5, 0, 0);
  if (next.getTime() <= Date.now()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - Date.now();
}

// ---- UCSD dataset record as a Google-Books-shaped object ----
const META = JSON.parse(fs.readFileSync('/tmp/goodreads-check/pool-meta.json', 'utf8'));
function ucsdMetadata(item) {
  const m = META[item.gr_book_id];
  if (!m || m.description.length < 40) return null;
  const description = m.description.replace(/<br\s*\/?>/gi, '\n').replace(/\s+\n/g, '\n').trim();
  const pad = (n) => String(n).padStart(2, '0');
  const publication_date = m.year ? (m.month && m.day ? `${m.year}-${pad(m.month)}-${pad(m.day)}` : String(m.year)) : null;
  return {
    google_books_id: null,
    title: item.title,
    author: item.author,
    publisher: m.publisher,
    publication_date,
    page_count: m.num_pages,
    description,
    cover_url: null,
    google_books_link: null,
    avg_rating: null,
    ratings_count: null,
    editorial_review: null,
    series_name: null,
    series_position: null,
    _isbn: m.isbn13 || m.isbn,
  };
}

// Downloads the Open Library cover for an ISBN into frontend/public/covers/ (same
// place mirrorCovers.js uses) and returns its site path, or null if there isn't a
// usable one. Titles-page scans are caught later in the end-of-run visual pass.
const COVERS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'frontend', 'public', 'covers');
async function mirrorOpenLibraryCover(bookId, isbn) {
  if (!isbn) return null;
  try {
    const res = await fetch(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8, png = buf[0] === 0x89 && buf[1] === 0x50;
    if (buf.length < 8000 || !(jpeg || png)) return null;
    fs.mkdirSync(COVERS_DIR, { recursive: true });
    const file = `${bookId}.${jpeg ? 'jpg' : 'png'}`;
    fs.writeFileSync(path.join(COVERS_DIR, file), buf);
    return `/covers/${file}`;
  } catch {
    return null;
  }
}

async function processBook(item) {
  const { title, author } = item;
  log(`\n=== "${title}" by ${author} (${item.series_name ? `${item.series_name} #${item.series_position}, ` : ''}${item.review_count} UCSD reviews) ===`);

  const reviewsPath = `${REVIEWS_DIR}/${item.gr_book_id}.json`;
  if (!fs.existsSync(reviewsPath)) return { status: 'skipped', reason: 'no-review-file' };
  const allReviews = JSON.parse(fs.readFileSync(reviewsPath, 'utf8'));

  // Metadata: Google Books when it answers and returns the right book; otherwise
  // the UCSD dataset's own record (description, publisher, pages, date, ISBN),
  // which by construction is the right book. Google outages or an exhausted
  // quota therefore never stall the run -- they only mean a thinner record.
  let gb = null;
  let source = 'google-books';
  if (googleAvailable()) {
    try {
      gb = await fetchGoogleBooksData(title, author);
      await sleep(RATE_LIMIT_DELAY_MS);
    } catch (err) {
      if (isQuotaError(err)) markGoogleDown(msUntilQuotaReset(), 'daily quota exhausted');
      else markGoogleDown(5 * 60 * 1000, `unavailable (${err.message.slice(0, 50).replace(/\s+/g, ' ')})`);
    }
  }
  // A Google result must be the right book (same author, overlapping title) and
  // have a description to tag from; anything else falls through to UCSD's record.
  if (gb && (!authorsAgree(author, gb.author) || ![...nameTokens(title)].some((w) => nameTokens(gb.title).has(w)) || !gb.description)) gb = null;
  if (!gb) {
    gb = ucsdMetadata(item);
    source = 'ucsd-metadata';
    if (!gb) return { status: 'skipped', reason: 'no-description-anywhere' };
  }

  if (source === 'google-books') {
    const existing = db.prepare('SELECT id FROM books WHERE google_books_id = ?').get(gb.google_books_id);
    if (existing) return { status: 'skipped', reason: `already-in-catalog-as-#${existing.id}` };
  } else {
    const same = db
      .prepare('SELECT id, COALESCE(author, seed_author) AS author FROM books WHERE LOWER(COALESCE(title, seed_title)) = LOWER(?)')
      .all(title)
      .find((r) => authorsAgree(author, r.author));
    if (same) return { status: 'skipped', reason: `already-in-catalog-as-#${same.id}` };
  }

  const book = findOrCreateBook(title, author);
  saveGoogleBooksData(book.id, gb);
  if (source === 'ucsd-metadata') {
    const local = await mirrorOpenLibraryCover(book.id, gb._isbn);
    if (local) db.prepare("UPDATE books SET cover_url = ? WHERE id = ?").run(local, book.id);
    if (gb._isbn) db.prepare('UPDATE books SET isbn = COALESCE(isbn, ?) WHERE id = ?').run(gb._isbn, book.id);
  }

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
  return { status: 'ok', book_id: book.id, dropped_quotes: bad.length, source };
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
