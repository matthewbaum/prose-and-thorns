import { log, sleep, RATE_LIMIT_DELAY_MS } from './util.js';

const API_URL = 'https://api.hardcover.app/v1/graphql';
const PER_RATING_BUCKET = 5;
// Sorting purely by likes_count skews the sample toward witty, critical
// outlier reviews — those get disproportionately liked regardless of how the
// book is actually received. Querying each rating band separately (still
// ranked by likes_count within the band) keeps the sample representative of
// the real rating distribution instead of just the funniest takes.
const RATING_BUCKETS = [
  { min: 0, max: 1.5 },
  { min: 1.5, max: 2.5 },
  { min: 2.5, max: 3.5 },
  { min: 3.5, max: 4.5 },
  { min: 4.5, max: 5.1 },
];

async function hardcoverQuery(query, variables) {
  const token = process.env.HARDCOVER_API_TOKEN;
  if (!token) {
    throw new Error('HARDCOVER_API_TOKEN is not set');
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
      'User-Agent': 'prose-and-thorns/0.1 (romantasy book discovery prototype)',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Hardcover API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  if (data.errors) {
    throw new Error(`Hardcover API returned errors: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

const FIND_BOOK_QUERY = `
  query FindBook($title: String!) {
    books(where: { title: { _eq: $title } }, order_by: { ratings_count: desc }, limit: 1) {
      id
      title
      slug
      rating
      ratings_count
      reviews_count
      cached_image
    }
  }
`;

const REVIEWS_BY_RATING_QUERY = `
  query BookReviewsByRating($bookId: Int!, $min: numeric!, $max: numeric!, $limit: Int!) {
    user_books(
      where: {
        book_id: { _eq: $bookId }
        has_review: { _eq: true }
        rating: { _gte: $min, _lt: $max }
      }
      order_by: { likes_count: desc }
      limit: $limit
    ) {
      rating
      likes_count
      review_markdown
      user {
        username
      }
    }
  }
`;

// Hardcover's exact-match title search misses books catalogued under a
// slightly different title (subtitles, punctuation). Strip a parenthetical
// suffix and retry once before giving up — cheap, catches most misses.
function titleVariants(title) {
  const variants = [title];
  const stripped = title.replace(/\s*[:(].*$/, '').trim();
  if (stripped && stripped !== title) variants.push(stripped);
  return variants;
}

export async function fetchHardcoverReviews(title, author, fallbackTitle) {
  let match = null;
  const candidates = titleVariants(title);
  // The catalog title sometimes comes from a Google Books match on the wrong
  // edition (a box set, "Special Edition", etc.) — the original seed title is
  // often the real single-book title and worth trying too before giving up.
  if (fallbackTitle && fallbackTitle !== title) {
    candidates.push(...titleVariants(fallbackTitle));
  }

  for (const variant of candidates) {
    const data = await hardcoverQuery(FIND_BOOK_QUERY, { title: variant });
    match = data.books?.[0];
    if (match && match.ratings_count > 0) break;
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  if (!match) {
    log(`No Hardcover match for "${title}" by ${author}`);
    return null;
  }

  let reviewRows = [];
  for (const bucket of RATING_BUCKETS) {
    await sleep(RATE_LIMIT_DELAY_MS);
    try {
      const data = await hardcoverQuery(REVIEWS_BY_RATING_QUERY, {
        bookId: match.id,
        min: bucket.min,
        max: bucket.max,
        limit: PER_RATING_BUCKET,
      });
      reviewRows.push(...(data.user_books || []));
    } catch (err) {
      log(`Hardcover review fetch failed for "${title}" (rating ${bucket.min}-${bucket.max}): ${err.message}`);
    }
  }

  const reviews = reviewRows
    .filter((r) => r.review_markdown && r.review_markdown.trim())
    .map((r) => ({
      source: 'hardcover',
      author: r.user?.username || 'anonymous',
      text: r.review_markdown.trim(),
      score: r.rating != null ? `${r.rating}/5 stars, ${r.likes_count} likes` : `${r.likes_count} likes`,
      // Hardcover's "Reviews" tab is client-side (no per-review deep link),
      // so every row points to the book's reviews section, not one specific
      // review — that's the real, working URL, not a fabricated anchor.
      url: match.slug ? `https://hardcover.app/books/${match.slug}` : null,
    }));

  return {
    avgRating: match.rating ?? null,
    ratingsCount: match.ratings_count ?? 0,
    coverUrl: match.cached_image?.url ?? null,
    hardcoverUrl: match.slug ? `https://hardcover.app/books/${match.slug}` : null,
    reviews,
  };
}
