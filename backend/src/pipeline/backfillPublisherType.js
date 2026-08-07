import 'dotenv/config';
import db from '../db/index.js';
import { getClaudeClient, CLAUDE_MODEL } from './claudeClient.js';
import { extractJson } from './util.js';
import { log, sleep, RATE_LIMIT_DELAY_MS } from './util.js';

// One-off backfill: classify publisher_type (traditional-major /
// traditional-indie / self-published / kindle-unlimited-exclusive) for books
// tagged before that field existed, without re-running the full tagging
// prompt and risking drift in already-good subgenre/trope data.

const PROMPT = ({ title, author, publisher, description }) => `Classify how "${title}" by ${author} is actually published, based on your own knowledge of this specific title and the publisher name below (if present).

PUBLISHER FIELD (from Google Books, may be blank or unhelpful): ${publisher || '(none given)'}
DESCRIPTION: ${description}

Return JSON only:
{
  "publisher_type": "traditional-major|traditional-indie|self-published|kindle-unlimited-exclusive|null"
}

Guidance:
- traditional-major: Big 5 imprints (Bloomsbury, Del Rey, Berkley, Ace, Wednesday Books, Harper Voyager, etc.)
- traditional-indie: smaller specialty presses (e.g. Entangled/Red Tower Books)
- self-published: indie/self-pub author, available broadly across retailers (not locked to one platform)
- kindle-unlimited-exclusive: self-pub/indie title you know is enrolled in KDP Select and only readable via Kindle/KU, not other retailers
Use your knowledge of this specific title's actual publishing history — do not guess from the publisher string alone if you know better. If you genuinely don't know, return null for publisher_type rather than guessing.`;

const updatePublisherType = db.prepare(
  `UPDATE books SET publisher_type = ?, updated_at = datetime('now') WHERE id = ?`
);

async function classify(book) {
  const anthropic = getClaudeClient();
  const description = [book.description, book.editorial_review].filter(Boolean).join('\n\n');
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: PROMPT({
          title: book.title || book.seed_title,
          author: book.author || book.seed_author,
          publisher: book.publisher,
          description,
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
      `SELECT id, title, seed_title, author, seed_author, publisher, description, editorial_review FROM books WHERE publisher_type IS NULL`
    )
    .all();

  log(`Backfilling publisher_type for ${books.length} books...`);
  let updated = 0;
  let unknown = 0;

  for (const book of books) {
    try {
      const result = await classify(book);
      const value = result?.publisher_type && result.publisher_type !== 'null' ? result.publisher_type : null;
      if (value) {
        updatePublisherType.run(value, book.id);
        updated += 1;
        log(`"${book.title || book.seed_title}" -> ${value}`);
      } else {
        unknown += 1;
        log(`Unknown publisher_type for "${book.title || book.seed_title}" — left null`);
      }
    } catch (err) {
      log(`Failed for "${book.title || book.seed_title}": ${err.message}`);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  log(`Done — ${updated}/${books.length} classified, ${unknown} left unknown.`);
}

main();
