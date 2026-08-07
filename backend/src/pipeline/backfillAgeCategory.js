import 'dotenv/config';
import db from '../db/index.js';
import { getClaudeClient, CLAUDE_MODEL } from './claudeClient.js';
import { extractJson } from './util.js';
import { log, sleep, RATE_LIMIT_DELAY_MS } from './util.js';

// One-off backfill: classify age_category (young-adult / new-adult / adult)
// for books tagged before that field existed, without re-running the full
// tagging prompt and risking drift in already-good subgenre/trope data.

const PROMPT = ({ title, author, description }) => `Classify the age category this book is actually published/marketed as, based on the description and your own knowledge of "${title}" by ${author}.

DESCRIPTION: ${description}

Return JSON only:
{
  "age_category": "young-adult|new-adult|adult"
}

Guidance: YA romantasy (e.g. Six of Crows, City of Bones, Strange the Dreamer) typically has teenage protagonists and closed-door or fade-to-black romance. New Adult and Adult skew toward college-age-or-older protagonists and can have any spice level. Use how the book is actually shelved/marketed, not a guess from genre alone. If genuinely uncertain, use your best judgment — this field must be one of the three values, not null.`;

const updateAgeCategory = db.prepare(
  `UPDATE books SET age_category = ?, updated_at = datetime('now') WHERE id = ?`
);

async function classify(book) {
  const anthropic = getClaudeClient();
  const description = [book.description, book.editorial_review].filter(Boolean).join('\n\n');
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 200,
    messages: [
      { role: 'user', content: PROMPT({ title: book.title || book.seed_title, author: book.author || book.seed_author, description }) },
    ],
  });
  const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return extractJson(text);
}

async function main() {
  const books = db
    .prepare(`SELECT id, title, seed_title, author, seed_author, description, editorial_review FROM books WHERE age_category IS NULL`)
    .all();

  log(`Backfilling age_category for ${books.length} books...`);
  let updated = 0;

  for (const book of books) {
    try {
      const result = await classify(book);
      if (result?.age_category) {
        updateAgeCategory.run(result.age_category, book.id);
        updated += 1;
        log(`"${book.title || book.seed_title}" -> ${result.age_category}`);
      } else {
        log(`No age_category returned for "${book.title || book.seed_title}"`);
      }
    } catch (err) {
      log(`Failed for "${book.title || book.seed_title}": ${err.message}`);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  log(`Done — ${updated}/${books.length} books classified.`);
}

main();
