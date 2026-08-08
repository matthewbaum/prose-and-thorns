import 'dotenv/config';
import db from '../db/index.js';
import { getClaudeClient, CLAUDE_MODEL } from './claudeClient.js';
import { extractJson } from './util.js';
import { log, sleep, RATE_LIMIT_DELAY_MS } from './util.js';

// One-off backfill: series_name was added to the tagging schema after all
// 139 books in the catalog were already tagged, so it's null for all of
// them (nothing else ever wrote to it — the only prior writer was a Google
// Books title-parsing fallback that almost never fires). This is a single-
// field targeted backfill rather than a full re-tag, both to avoid the cost
// of redoing every other field and because tagged_at already gates normal
// re-tagging.

const PROMPT = ({ title, author, seriesStatus, seriesPosition, seriesTotal }) => `"${title}" by ${author} has series_status "${seriesStatus}"${seriesPosition ? `, position ${seriesPosition}` : ''}${seriesTotal ? ` of ${seriesTotal}` : ''} in our catalog. Using your own knowledge of this specific book, give the canonical series name.

Rules:
- If the series has its own widely-known name, use that exact name (e.g. "The Empyrean", "Throne of Glass", "The Folk of the Air").
- If the series is only known by its first book's title (no separate series name), use the exact title of book 1 (e.g. the ACOTAR series -> "A Court of Thorns and Roses").
- This must exactly match what you'd say for every other book in the same series, since each book is tagged independently and matched by this string later.
- null for true standalones or if you genuinely don't know.

Return JSON only:
{
  "series_name": ""
}`;

const updateSeriesName = db.prepare(
  `UPDATE books SET series_name = ?, updated_at = datetime('now') WHERE id = ?`
);

async function classify(book) {
  const anthropic = getClaudeClient();
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: PROMPT({
          title: book.title || book.seed_title,
          author: book.author || book.seed_author,
          seriesStatus: book.series_status,
          seriesPosition: book.series_position,
          seriesTotal: book.series_total,
        }),
      },
    ],
  });
  const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return extractJson(text);
}

async function main() {
  const books = db
    .prepare(
      `SELECT id, title, seed_title, author, seed_author, series_status, series_position, series_total
       FROM books WHERE series_name IS NULL AND series_status IS NOT NULL AND series_status != 'standalone'`
    )
    .all();

  log(`Backfilling series_name for ${books.length} non-standalone books...`);
  let updated = 0;

  for (const book of books) {
    try {
      const result = await classify(book);
      const value = result?.series_name && result.series_name !== 'null' ? result.series_name : null;
      if (value) {
        updateSeriesName.run(value, book.id);
        updated += 1;
        log(`"${book.title || book.seed_title}" -> "${value}"`);
      } else {
        log(`No series_name for "${book.title || book.seed_title}" — left null`);
      }
    } catch (err) {
      log(`Failed for "${book.title || book.seed_title}": ${err.message}`);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  log(`Done — ${updated}/${books.length} classified.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
