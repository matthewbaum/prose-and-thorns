import 'dotenv/config';
import { SEED_BOOKS } from './seedList.js';
import { fetchGoogleBooksData } from './googleBooks.js';
import { fetchRedditReviews } from './reddit.js';
import { tagBook } from './claudeTagging.js';
import { synthesizeQuality } from './claudeSynthesis.js';
import {
  findOrCreateBook,
  saveGoogleBooksData,
  markGoogleBooksMissing,
  saveReviews,
  getReviewsForBook,
  saveTags,
  saveQualityProfile,
} from '../db/pipelineRepo.js';
import { sleep, RATE_LIMIT_DELAY_MS, log } from './util.js';
import { status, resetStatus, finishStatus } from './status.js';

const REDDIT_CONFIGURED = Boolean(
  process.env.REDDIT_CLIENT_ID &&
    process.env.REDDIT_CLIENT_SECRET &&
    process.env.REDDIT_USERNAME &&
    process.env.REDDIT_PASSWORD
);

async function processBook(seed) {
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

  // Step 4 — Claude trope tagging
  if (!book.tagged_at && book.description) {
    try {
      const tags = await tagBook(book.description, book.editorial_review);
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
      const profile = await synthesizeQuality({
        title: displayTitle,
        author: displayAuthor,
        avgRating: book.avg_rating,
        ratingsCount: book.ratings_count,
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
