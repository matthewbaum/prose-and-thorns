import 'dotenv/config';
import db from '../db/index.js';
import { log, sleep } from './util.js';

const API_URL = 'https://api.hardcover.app/v1/graphql';
// Same delay as backfillAudible.js's HARDCOVER_DELAY_MS -- calibrated for
// this API's rate limiter specifically.
const HARDCOVER_DELAY_MS = 2500;

// Keyed off the book's own hardcover_url slug (already a verified match from
// the original review pipeline run) -- same reasoning as backfillAudible.js.
// default_physical_edition is Hardcover's own curated "this is the edition"
// pick for a title, so this doesn't have to guess which of a book's many
// editions (translations, box sets, reprints) is the right one to cite an
// ISBN from.
//
// Verified case: ~21/500 books had a default_physical_edition assigned but
// no isbn_13 recorded on that specific edition row, even though other
// (usually foreign-language) editions of the same book did have one --
// e.g. The Night Circus's default edition has no ISBN, but 5+ others do.
// The fallback below only fires when the default edition has nothing, and
// is filtered to English-language (language_id 1) physical editions
// (reading_format_id 1) with a real ISBN -- unlike the Audible ASIN case,
// picking a non-default *edition* of the same book here risks a different
// printing/cover showing on Bookshop.org, not linking to the wrong book
// entirely, so this is a much lower-stakes guess.
const ISBN_QUERY = `
  query BookIsbn($slug: String!) {
    books(where: { slug: { _eq: $slug } }, limit: 1) {
      default_physical_edition {
        isbn_13
      }
    }
    editions(
      where: { book: { slug: { _eq: $slug } }, isbn_13: { _is_null: false }, reading_format_id: { _eq: 1 }, language_id: { _eq: 1 } }
      limit: 1
    ) {
      isbn_13
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
    body: JSON.stringify({ query: ISBN_QUERY, variables }),
  });
  if (!res.ok) throw new Error(`Hardcover API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

function slugFromHardcoverUrl(url) {
  return url?.split('/books/')?.[1] || null;
}

const updateBook = db.prepare('UPDATE books SET isbn = ? WHERE id = ?');

async function main() {
  const books = db
    .prepare(`SELECT id, title, hardcover_url FROM books WHERE hardcover_url IS NOT NULL AND isbn IS NULL`)
    .all();

  log(`Looking up ISBNs for ${books.length} books...`);
  let found = 0;

  for (const book of books) {
    const slug = slugFromHardcoverUrl(book.hardcover_url);
    if (!slug) continue;
    await sleep(HARDCOVER_DELAY_MS);
    try {
      const data = await hardcoverQuery({ slug });
      const isbn = data.books?.[0]?.default_physical_edition?.isbn_13 || data.editions?.[0]?.isbn_13 || null;
      if (isbn) {
        updateBook.run(isbn, book.id);
        found += 1;
        log(`ISBN found for "${book.title}" (${isbn})`);
      }
    } catch (err) {
      log(`Failed for "${book.title}": ${err.message}`);
    }
  }

  log(`Done — ${found}/${books.length} books have a confirmed ISBN.`);
}

main();
