import 'dotenv/config';
import db from '../db/index.js';
import { getClaudeClient, CLAUDE_MODEL } from './claudeClient.js';
import { extractJson } from './util.js';
import { log, sleep, RATE_LIMIT_DELAY_MS } from './util.js';

// One-off backfill: split the raw Google Books description into a clean
// synopsis + separated praise blurbs, for books tagged before that split
// existed. Doesn't touch subgenre/trope/etc. tagging already on file.

const PROMPT = ({ title, author, description }) => `Publisher descriptions usually mix the actual plot summary together with review blurbs, award mentions, and pull-quotes ("'Utterly captivating' —NYT", "#1 bestseller", "Winner of the X Prize") with no separation. Split this description of "${title}" by ${author} into two pieces — don't discard anything, just sort it.

DESCRIPTION: ${description}

Return JSON only:
{
  "synopsis": "only the sentences that describe the story itself (plot, characters, setting) — preserve the original wording/voice",
  "praise": ["every blurb, pull-quote, award mention, and bestseller-list claim, verbatim, as separate strings — empty array if none"]
}

If you can't cleanly separate something, leave it in synopsis rather than dropping it.`;

const updateSynopsis = db.prepare(
  `UPDATE books SET synopsis = ?, praise = ?, updated_at = datetime('now') WHERE id = ?`
);

async function classify(book) {
  const anthropic = getClaudeClient();
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 3072,
    messages: [
      { role: 'user', content: PROMPT({ title: book.title || book.seed_title, author: book.author || book.seed_author, description: book.description }) },
    ],
  });
  const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return extractJson(text);
}

async function main() {
  const books = db
    .prepare(`SELECT id, title, seed_title, author, seed_author, description FROM books WHERE synopsis IS NULL AND description IS NOT NULL AND description != ''`)
    .all();

  log(`Backfilling synopsis/praise for ${books.length} books...`);
  let updated = 0;

  for (const book of books) {
    try {
      const result = await classify(book);
      if (result?.synopsis) {
        updateSynopsis.run(result.synopsis, JSON.stringify(result.praise || []), book.id);
        updated += 1;
        log(`"${book.title || book.seed_title}" -> synopsis + ${(result.praise || []).length} praise item(s)`);
      } else {
        log(`No synopsis returned for "${book.title || book.seed_title}"`);
      }
    } catch (err) {
      log(`Failed for "${book.title || book.seed_title}": ${err.message}`);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  log(`Done — ${updated}/${books.length} books split.`);
}

main();
