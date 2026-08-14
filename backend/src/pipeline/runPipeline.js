import 'dotenv/config';
import { SEED_BOOKS } from './seedList.js';
import { fetchGoogleBooksData } from './googleBooks.js';
import { fetchRedditReviews } from './reddit.js';
import { fetchHardcoverReviews } from './hardcover.js';
import { tagBook } from './claudeTagging.js';
import { synthesizeQuality } from './claudeSynthesis.js';
import {
  findOrCreateBook,
  saveGoogleBooksData,
  markGoogleBooksMissing,
  saveReviews,
  saveHardcoverReviews,
  markHardcoverMissing,
  getReviewsForBook,
  saveTags,
  saveQualityProfile,
} from '../db/pipelineRepo.js';
import { sleep, RATE_LIMIT_DELAY_MS, log } from './util.js';
import { status, resetStatus, finishStatus } from './status.js';
import { runAudit } from './auditCatalog.js';
import db from '../db/index.js';

const REDDIT_CONFIGURED = Boolean(
  process.env.REDDIT_CLIENT_ID &&
    process.env.REDDIT_CLIENT_SECRET &&
    process.env.REDDIT_USERNAME &&
    process.env.REDDIT_PASSWORD
);
const HARDCOVER_CONFIGURED = Boolean(process.env.HARDCOVER_API_TOKEN);

export async function processBook(seed) {
  status.currentTitle = `${seed.title} — ${seed.author}`;
  log(`Processing "${seed.title}" by ${seed.author}`);

  let book = findOrCreateBook(seed.title, seed.author);

  // Step 2 — Google Books (never call twice)
  if (!book.google_books_fetched_at) {
    try {
      const gb = await fetchGoogleBooksData(seed.title, seed.author);
      if (gb) {
        saveGoogleBooksData(book.id, gb);
      } else {
        markGoogleBooksMissing(book.id);
      }
    } catch (err) {
      log(`Google Books failed for "${seed.title}": ${err.message}`);
      status.errors.push({ title: seed.title, step: 'google_books', message: err.message });
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  book = findOrCreateBook(seed.title, seed.author);
  const displayTitle = book.title || seed.title;
  const displayAuthor = book.author || seed.author;

  // Step 3 — Reddit reviews (never call twice; skip cleanly if not configured)
  if (!book.reddit_fetched_at && REDDIT_CONFIGURED) {
    try {
      const reviews = await fetchRedditReviews(displayTitle, displayAuthor);
      saveReviews(book.id, reviews);
    } catch (err) {
      log(`Reddit fetch failed for "${displayTitle}": ${err.message}`);
      status.errors.push({ title: seed.title, step: 'reddit', message: err.message });
    }
  }

  book = findOrCreateBook(seed.title, seed.author);

  // Step 3b — Hardcover reviews (never call twice; skip cleanly if not configured)
  if (!book.hardcover_fetched_at && HARDCOVER_CONFIGURED) {
    try {
      const hc = await fetchHardcoverReviews(displayTitle, displayAuthor, seed.title);
      if (hc) {
        saveHardcoverReviews(book.id, hc);
      } else {
        markHardcoverMissing(book.id);
      }
    } catch (err) {
      log(`Hardcover fetch failed for "${displayTitle}": ${err.message}`);
      status.errors.push({ title: seed.title, step: 'hardcover', message: err.message });
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  book = findOrCreateBook(seed.title, seed.author);

  // Step 4 — Claude trope tagging
  if (!book.tagged_at && book.description) {
    try {
      const tags = await tagBook({
        title: displayTitle,
        author: displayAuthor,
        description: book.description,
        editorialReview: book.editorial_review,
      });
      if (tags) {
        saveTags(book.id, tags);
        if (tags.confidence === 'low') {
          log(`Low-confidence tagging flagged for review: "${displayTitle}"`);
        }
      }
    } catch (err) {
      log(`Claude tagging failed for "${displayTitle}": ${err.message}`);
      status.errors.push({ title: seed.title, step: 'tagging', message: err.message });
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  book = findOrCreateBook(seed.title, seed.author);

  // Step 6 — Claude quality synthesis (Step 5, series metadata, is folded into Google Books parsing)
  if (!book.quality_synthesized_at) {
    try {
      const reviews = getReviewsForBook(book.id);
      // Prefer Hardcover's rating as the anchor when we have it — it's
      // typically backed by orders of magnitude more ratings than Google
      // Books', so it's a far more reliable prior for the model to reconcile
      // the (smaller, potentially skewed) sampled review text against.
      const anchorRating = book.hardcover_avg_rating ?? book.avg_rating;
      const anchorRatingsCount = book.hardcover_avg_rating != null ? book.hardcover_ratings_count : book.ratings_count;
      const profile = await synthesizeQuality({
        title: displayTitle,
        author: displayAuthor,
        avgRating: anchorRating,
        ratingsCount: anchorRatingsCount,
        reviews,
      });
      if (profile) {
        saveQualityProfile(book.id, profile);
        if (reviews.length < 5) {
          log(`Limited reviews (${reviews.length}) for "${displayTitle}" — confidence should read low`);
        }
      } else {
        log(`No reviews available to synthesize quality for "${displayTitle}"`);
      }
    } catch (err) {
      log(`Claude synthesis failed for "${displayTitle}": ${err.message}`);
      status.errors.push({ title: seed.title, step: 'synthesis', message: err.message });
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  status.completed += 1;
}

export async function runPipeline() {
  if (status.running) {
    log('Pipeline already running, ignoring duplicate trigger');
    return status;
  }

  resetStatus(SEED_BOOKS.length);
  log(`Starting pipeline for ${SEED_BOOKS.length} seed titles`);

  for (const seed of SEED_BOOKS) {
    try {
      await processBook(seed);
    } catch (err) {
      log(`Unexpected failure on "${seed.title}": ${err.message}`);
      status.errors.push({ title: seed.title, step: 'unknown', message: err.message });
      status.completed += 1;
    }
  }

  finishStatus();
  log(`Pipeline finished. ${status.total - status.errors.length}/${status.total} processed cleanly.`);

  log('Running catalog audit...');
  await runAudit();

  // WAL mode means writes from this whole run sit in prose-and-thorns.sqlite-wal
  // until checkpointed — .gitignore excludes that file as transient, so a
  // commit made without this step can silently miss everything just written
  // (verified case: an entire session's catalog changes never left the WAL,
  // so what got pushed was hours stale despite every local check looking
  // correct). Checkpointing automatically here means a batch is always safe
  // to commit immediately after `npm run seed` finishes.
  db.pragma('wal_checkpoint(TRUNCATE)');
  log('WAL checkpointed.');

  return status;
}

// Allow running directly: `npm run seed`
if (import.meta.url === `file://${process.argv[1]}`) {
  runPipeline()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
