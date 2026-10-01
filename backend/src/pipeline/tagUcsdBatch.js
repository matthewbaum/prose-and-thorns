import 'dotenv/config';
import db from '../db/index.js';
import { tagBook } from './claudeTagging.js';
import { saveTags } from '../db/pipelineRepo.js';
import { sleep, RATE_LIMIT_DELAY_MS, log } from './util.js';

// The 89-book UCSD batch add (addSeriesFromUcsd.js) never ran the Claude
// tagging step -- it only fetched Google Books metadata and ran UCSD review
// synthesis. That left every one of those books with no subgenre/tropes/
// spice_level/etc, which meant they couldn't surface in any trope/subgenre
// filter and were excluded from every homepage shelf (shelves.js requires
// >2 romance_tropes). This backfills tagging for exactly that batch.
const SERIES_NAMES = [
  'Anita Blake',
  'Sookie Stackhouse',
  'House of Night',
  'Charley Davidson',
  'Fever',
  'Guild Hunter',
  'Bloodlines',
  'Lux',
];

const books = db
  .prepare(
    `SELECT id, title, author, description, editorial_review FROM books
     WHERE tagged_at IS NULL AND series_name IN (${SERIES_NAMES.map(() => '?').join(',')})`
  )
  .all(...SERIES_NAMES);

async function main() {
  log(`Tagging ${books.length} untagged books from the UCSD batch...`);
  let tagged = 0;
  let skippedNoDescription = 0;

  for (const book of books) {
    if (!book.description && !book.editorial_review) {
      log(`  #${book.id} "${book.title}": no description -- skipping (handle separately)`);
      skippedNoDescription += 1;
      continue;
    }
    try {
      const tags = await tagBook({
        title: book.title,
        author: book.author,
        description: book.description,
        editorialReview: book.editorial_review,
      });
      if (tags) {
        saveTags(book.id, tags);
        tagged += 1;
        log(`  #${book.id} "${book.title}": tagged (subgenre=${tags.subgenre}, confidence=${tags.confidence})`);
      } else {
        log(`  #${book.id} "${book.title}": tagBook returned null`);
      }
    } catch (err) {
      log(`  #${book.id} "${book.title}": FAILED -- ${err.message}`);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  const result = db.pragma('wal_checkpoint(TRUNCATE)');
  log(`WAL checkpoint: ${JSON.stringify(result)}`);
  log(`Done. ${tagged}/${books.length} tagged, ${skippedNoDescription} skipped (no description).`);
}

main();
