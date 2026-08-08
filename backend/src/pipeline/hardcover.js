import { log, sleep } from './util.js';

const API_URL = 'https://api.hardcover.app/v1/graphql';
// Sorting purely by likes_count skews the sample toward witty, critical
// outlier reviews — those get disproportionately liked regardless of how the
// book is actually received. Querying each rating band separately (still
// ranked by likes_count within the band) avoids that specific bias.
//
// The per-band SAMPLE SIZE is not flat, though — verified case: "The
// Nightingale" (970 ratings, 4.35 average — i.e. ~96% of real raters are
// in the top two bands) got a sample where the bottom two bands supplied
// 16 of 32 reviews (50%) under a flat 8-per-band design, because those
// bands only need a handful of written reviews to exist anywhere to fill
// their full quota, regardless of how rare that opinion truly is. That
// silently manufactures a far more negative-looking sample than the real
// readership, which the synthesis then faithfully (and wrongly) reflects.
// Quotas are now proportional to each band's real share of total ratings,
// with a small floor per non-empty band so a genuine-but-rare complaint
// isn't made completely invisible by rounding to zero.
const TOTAL_SAMPLE_TARGET = 40;
const MIN_PER_BAND = 2;
// Proportional sampling roughly doubles Hardcover calls per book (5 band-count
// queries + up to 5 review queries, vs. the old flat design's 5) — verified
// case: a 145-book batch at the shared 1000ms RATE_LIMIT_DELAY_MS started
// throwing raw "fetch failed" (a connection-level error, not an HTTP status)
// around book #12 and was failing almost continuously by book #19, consistent
// with tripping Hardcover's rate limiter. This delay is local to this file
// (not the shared RATE_LIMIT_DELAY_MS) so it doesn't slow down unrelated
// pipeline steps that don't hit this same limit.
const HARDCOVER_DELAY_MS = 2500;
const MAX_RETRIES = 3;
const RATING_BUCKETS = [
  { min: 0, max: 1.5 },
  { min: 1.5, max: 2.5 },
  { min: 2.5, max: 3.5 },
  { min: 3.5, max: 4.5 },
  { min: 4.5, max: 5.1 },
];

const RATING_BAND_COUNTS_QUERY = `
  query RatingBandCount($bookId: Int!, $min: numeric!, $max: numeric!) {
    user_books_aggregate(where: { book_id: { _eq: $bookId }, rating: { _gte: $min, _lt: $max } }) {
      aggregate { count }
    }
  }
`;

async function fetchBandCounts(bookId) {
  const counts = [];
  for (const bucket of RATING_BUCKETS) {
    const data = await hardcoverQuery(RATING_BAND_COUNTS_QUERY, { bookId, min: bucket.min, max: bucket.max });
    counts.push(data.user_books_aggregate.aggregate.count);
    await sleep(HARDCOVER_DELAY_MS);
  }
  return counts;
}

// Floor first (so a rare-but-real band still gets a couple of slots),
// then distribute the remainder proportionally to each band's true share.
// A book with no rating data at all (counts all zero) falls back to the
// old flat-8 behavior rather than dividing by zero.
function computeBandQuotas(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return RATING_BUCKETS.map(() => 8);

  const floors = counts.map((c) => (c > 0 ? Math.min(MIN_PER_BAND, c) : 0));
  const reserved = floors.reduce((a, b) => a + b, 0);
  const remaining = Math.max(0, TOTAL_SAMPLE_TARGET - reserved);

  return counts.map((c, i) => {
    const share = total > 0 ? Math.round((remaining * c) / total) : 0;
    return Math.min(floors[i] + share, c);
  });
}

async function hardcoverQuery(query, variables) {
  const token = process.env.HARDCOVER_API_TOKEN;
  if (!token) {
    throw new Error('HARDCOVER_API_TOKEN is not set');
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
          'User-Agent': 'prose-and-thorns/0.1 (romantasy book discovery prototype)',
        },
        body: JSON.stringify({ query, variables }),
      });

      // 429/5xx are worth retrying (rate limit or transient upstream issue);
      // other 4xx (bad query, auth) won't fix themselves on retry.
      if (!res.ok) {
        const body = await res.text();
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          await sleep(HARDCOVER_DELAY_MS * attempt * 2);
          continue;
        }
        throw new Error(`Hardcover API error ${res.status}: ${body}`);
      }

      const data = await res.json();
      if (data.errors) {
        throw new Error(`Hardcover API returned errors: ${JSON.stringify(data.errors)}`);
      }
      return data.data;
    } catch (err) {
      // A thrown "fetch failed" (connection reset, DNS blip) has no HTTP
      // status to inspect — verified case: a 145-book batch tripped
      // Hardcover's rate limiter partway through and every subsequent
      // request failed this way, with no response object to check .status
      // on. Retry it the same as a 429, but let real API errors (thrown
      // above with a status code in the message) still propagate on the
      // last attempt.
      if (attempt >= MAX_RETRIES) throw err;
      await sleep(HARDCOVER_DELAY_MS * attempt * 2);
    }
  }
}

// limit is >1 deliberately — some titles (verified: "Circe") are split across
// many duplicate edition rows on Hardcover's side that all tie at
// ratings_count 0, so "order by ratings_count, limit 1" can land on an
// arbitrary one of the ties, including a stub with no cover image at all.
// pickBestMatch below re-ranks the candidates client-side using cached_image
// as a tiebreaker, which ratings_count alone can't provide when every
// candidate ties.
// limit is 30, not 8: verified case "Circe" has 15 duplicate entries that
// all tie at ratings_count 0, in arbitrary Postgres tie order — the real
// Madeline Miller edition (also ratings_count 0 in this exact-title query)
// was sitting outside the top 8 and silently excluded before authorMatches
// even got a chance to see it, producing a false "no match" for a book that
// is very much on Hardcover.
const FIND_BOOK_QUERY = `
  query FindBook($title: String!) {
    books(where: { title: { _eq: $title } }, order_by: { ratings_count: desc }, limit: 30) {
      id
      title
      slug
      rating
      ratings_count
      reviews_count
      cached_image
      contributions {
        author {
          name
        }
      }
    }
  }
`;

function normalizeName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A common, short title like "Circe" is shared by a dozen unrelated obscure
// books on Hardcover (verified: 8 different "Circe" entries, none by
// Madeline Miller, spanning random small-press/public-domain authors).
// Without checking the author, a "pick the best image" tiebreaker can
// confidently attach a totally unrelated book's cover — worse than no
// cover at all. Only candidates whose contributor list shares a real name
// token with the expected author are eligible.
function authorMatches(candidate, expectedAuthor) {
  const expected = new Set(normalizeName(expectedAuthor).split(' ').filter((w) => w.length > 2));
  if (expected.size === 0) return true; // nothing to check against
  const contributors = candidate.contributions || [];
  if (contributors.length === 0) return false;
  return contributors.some((c) => {
    const nameWords = new Set(normalizeName(c.author?.name).split(' ').filter((w) => w.length > 2));
    return [...expected].some((w) => nameWords.has(w));
  });
}

function pickBestMatch(candidates, expectedAuthor) {
  if (!candidates || candidates.length === 0) return null;
  const eligible = candidates.filter((c) => authorMatches(c, expectedAuthor));
  if (eligible.length === 0) return null;

  const scored = eligible.map((c) => {
    const image = c.cached_image || {};
    const hasImage = Boolean(image.url);
    const resolution = (image.width || 0) * (image.height || 0);
    return { candidate: c, hasImage, resolution };
  });
  scored.sort((a, b) => {
    if (b.candidate.ratings_count !== a.candidate.ratings_count) {
      return b.candidate.ratings_count - a.candidate.ratings_count;
    }
    if (a.hasImage !== b.hasImage) return a.hasImage ? -1 : 1;
    return b.resolution - a.resolution;
  });
  return scored[0].candidate;
}

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
    match = pickBestMatch(data.books, author);
    if (match && match.ratings_count > 0) break;
    await sleep(HARDCOVER_DELAY_MS);
  }

  if (!match) {
    log(`No Hardcover match for "${title}" by ${author}`);
    return null;
  }

  let bandCounts;
  try {
    bandCounts = await fetchBandCounts(match.id);
  } catch (err) {
    log(`Hardcover band-count fetch failed for "${title}": ${err.message} — falling back to flat sampling`);
    bandCounts = null;
  }
  const quotas = bandCounts ? computeBandQuotas(bandCounts) : RATING_BUCKETS.map(() => 8);

  let reviewRows = [];
  for (let i = 0; i < RATING_BUCKETS.length; i++) {
    const bucket = RATING_BUCKETS[i];
    const limit = quotas[i];
    if (limit <= 0) continue;
    await sleep(HARDCOVER_DELAY_MS);
    try {
      const data = await hardcoverQuery(REVIEWS_BY_RATING_QUERY, {
        bookId: match.id,
        min: bucket.min,
        max: bucket.max,
        limit,
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
