import 'dotenv/config';
import db from '../db/index.js';
import { log, sleep, RATE_LIMIT_DELAY_MS } from './util.js';

const API_URL = 'https://api.hardcover.app/v1/graphql';

const FIND_BOOK_QUERY = `
  query FindBook($title: String!) {
    books(where: { title: { _eq: $title } }, order_by: { ratings_count: desc }, limit: 1) {
      id
      slug
      ratings_count
      cached_image
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
    body: JSON.stringify({ query: FIND_BOOK_QUERY, variables }),
  });
  if (!res.ok) throw new Error(`Hardcover API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

function titleVariants(title) {
  const variants = [title];
  const stripped = title.replace(/\s*[:(].*$/, '').trim();
  if (stripped && stripped !== title) variants.push(stripped);
  return variants;
}

const updateBook = db.prepare(
  'UPDATE books SET hardcover_cover_url = COALESCE(hardcover_cover_url, ?), hardcover_url = ? WHERE id = ?'
);

async function main() {
  const books = db
    .prepare(
      `SELECT id, title, seed_title FROM books WHERE hardcover_avg_rating IS NOT NULL AND hardcover_url IS NULL`
    )
    .all();

  log(`Backfilling Hardcover URLs for ${books.length} books...`);
  let updated = 0;

  for (const book of books) {
    const candidates = [
      ...titleVariants(book.title || book.seed_title),
      ...titleVariants(book.seed_title),
    ];
    let coverUrl = null;
    let hardcoverUrl = null;
    for (const variant of candidates) {
      await sleep(RATE_LIMIT_DELAY_MS);
      try {
        const data = await hardcoverQuery({ title: variant });
        const match = data.books?.[0];
        if (match?.slug) {
          coverUrl = match.cached_image?.url ?? null;
          hardcoverUrl = `https://hardcover.app/books/${match.slug}`;
          break;
        }
      } catch (err) {
        log(`Failed for "${variant}": ${err.message}`);
      }
    }
    if (hardcoverUrl) {
      updateBook.run(coverUrl, hardcoverUrl, book.id);
      updated += 1;
      log(`URL found for "${book.title}"`);
    } else {
      log(`No match found for "${book.title}"`);
    }
  }

  log(`Done — ${updated}/${books.length} Hardcover URLs backfilled.`);
}

main();
