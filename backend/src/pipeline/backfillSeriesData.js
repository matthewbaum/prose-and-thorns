import 'dotenv/config';
import db from '../db/index.js';
import { getClaudeClient, CLAUDE_MODEL } from './claudeClient.js';
import { extractJson } from './util.js';
import { log, sleep, RATE_LIMIT_DELAY_MS } from './util.js';

// series_total was previously asked per-book, independently, during each
// book's own tagging call — verified this produces genuinely inconsistent
// answers across siblings in the same series (Dark Olympus alone had three
// books independently reporting totals of 8, 5, and 6). This backfill asks
// ONE authoritative question per unique series and applies the same answer
// to every book sharing that series_name, instead of trusting each book's
// own guess. It also captures the ordered title list, so "More in this
// series" can show real titles for books not yet in the catalog instead of
// a bare "Book N".

const PROMPT = ({ seriesName, author }) => `Using your own knowledge, describe the book series "${seriesName}" by ${author} (or its most likely author if you're not fully sure who "${author}" refers to in this context).

Return JSON only:
{
  "series_total": 0,
  "titles": ["Book 1 title", "Book 2 title", "..."]
}

Rules:
- series_total: the real total number of books in this series (published + confirmed upcoming). null if you genuinely don't know.
- titles: the actual book titles in reading order, position 1 first. Include titles you're confident about even if you don't know the exact total — leave a gap as null in the array rather than guessing a title. Empty array if you don't know any of them.`;

const updateSeriesData = db.prepare(`
  UPDATE books SET series_total = ?, series_titles = ?, updated_at = datetime('now')
  WHERE series_name = ?
`);

async function classify(seriesName, author) {
  const anthropic = getClaudeClient();
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 800,
    messages: [{ role: 'user', content: PROMPT({ seriesName, author }) }],
  });
  const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return extractJson(text);
}

async function main() {
  const series = db
    .prepare(
      `SELECT series_name, MIN(author) as author, COUNT(*) as book_count
       FROM books WHERE series_name IS NOT NULL GROUP BY series_name`
    )
    .all();

  log(`Backfilling series data for ${series.length} unique series...`);
  let updated = 0;

  for (const s of series) {
    try {
      const result = await classify(s.series_name, s.author);
      const total = result?.series_total && result.series_total > 0 ? result.series_total : null;
      const titles = Array.isArray(result?.titles) ? result.titles : [];
      if (total || titles.length > 0) {
        updateSeriesData.run(total, JSON.stringify(titles), s.series_name);
        updated += 1;
        log(`"${s.series_name}" -> total ${total}, ${titles.length} titles known`);
      } else {
        log(`No series data for "${s.series_name}" — left as-is`);
      }
    } catch (err) {
      log(`Failed for "${s.series_name}": ${err.message}`);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  log(`Done — ${updated}/${series.length} series updated.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
