import 'dotenv/config';
import db from '../db/index.js';
import { log, sleep } from './util.js';

const API_URL = 'https://api.hardcover.app/v1/graphql';
// Same delay as hardcover.js's HARDCOVER_DELAY_MS -- the shared
// RATE_LIMIT_DELAY_MS (1000ms) is calibrated for lighter external calls and
// has been observed to trip Hardcover's own rate limiter specifically.
const HARDCOVER_DELAY_MS = 2500;

// Keyed off the book's own hardcover_url slug (already a verified match from
// the original review pipeline run), not re-derived from title/author --
// avoids re-solving the wrong-edition-matching problem this project has hit
// repeatedly elsewhere, since the slug is an exact identifier rather than a
// fuzzy title lookup. reading_format_id 2 is Hardcover's "Listened"
// (audiobook) format; a real ASIN on that edition is what actually confirms
// an Audible release exists, vs. just guessing one does.
const AUDIOBOOK_EDITION_QUERY = `
  query AudiobookEdition($slug: String!) {
    editions(
      where: { book: { slug: { _eq: $slug } }, reading_format_id: { _eq: 2 }, asin: { _is_null: false } }
      limit: 1
    ) {
      asin
    }
  }
`;

async function hardcoverQuery(variables) {
  const token = process.env.HARDCOVER_API_TOKEN;
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
      'User-Agent': 'prose-and-thorns/0.1 (romantasy book discovery prototype)',
    },
    body: JSON.stringify({ query: AUDIOBOOK_EDITION_QUERY, variables }),
  });
  if (!res.ok) throw new Error(`Hardcover API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

function slugFromHardcoverUrl(url) {
  return url?.split('/books/')?.[1] || null;
}

const updateBook = db.prepare('UPDATE books SET audible_asin = ? WHERE id = ?');

async function main() {
  const books = db
    .prepare(`SELECT id, title, hardcover_url FROM books WHERE hardcover_url IS NOT NULL AND audible_asin IS NULL`)
    .all();

  log(`Checking Audible availability for ${books.length} books...`);
  let found = 0;

  for (const book of books) {
    const slug = slugFromHardcoverUrl(book.hardcover_url);
    if (!slug) continue;
    await sleep(HARDCOVER_DELAY_MS);
    try {
      const data = await hardcoverQuery({ slug });
      const asin = data.editions?.[0]?.asin || null;
      if (asin) {
        updateBook.run(asin, book.id);
        found += 1;
        log(`Audiobook found for "${book.title}" (${asin})`);
      }
    } catch (err) {
      log(`Failed for "${book.title}": ${err.message}`);
    }
  }

  log(`Done — ${found}/${books.length} books have a confirmed Audible edition.`);
}

main();
