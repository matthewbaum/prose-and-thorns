import { log } from './util.js';

const API_BASE = 'https://www.googleapis.com/books/v1/volumes';

// Google Books rarely returns structured series info, but many volumes encode
// it in the title, e.g. "Fourth Wing (The Empyrean, #1)". Parse that pattern
// as a best-effort fallback for Step 5 (series metadata).
function parseSeriesFromTitle(title) {
  const match = title.match(/\(([^,()]+),\s*#(\d+)\)/);
  if (!match) return { seriesName: null, seriesPosition: null };
  return { seriesName: match[1].trim(), seriesPosition: Number(match[2]) };
}

// Google's ranking sometimes puts a box set, "deluxe illustrated" companion,
// or the wrong book in a series ahead of the actual title being searched for
// (verified: this silently corrupted 8/99 books in this catalog — e.g. a
// "Caraval" search top hit was "Finale", book 3 of the same series). Score
// every returned candidate against the seed title instead of blindly taking
// index 0.
// Exported so auditCatalog.js can flag any title that slipped through this
// scoring despite the penalty (e.g. a low-scoring wrong-product candidate
// that still won because every other candidate scored even lower).
// "trilogy"/"duology" added after two more slipped through this way (verified
// cases: "Kingdom of the Wicked Complete Trilogy" and "The Six of Crows
// Duology" both matched as book 1 of their series instead of the standalone
// single-book edition) — the original list caught "box set"/"omnibus"/etc.
// but missed this specific bundle-naming convention entirely.
export const WRONG_PRODUCT_PATTERN =
  /\b(box set|boxed set|\d+[- ]book set|collection|bundle|deluxe|illustrated|omnibus|gift set|ebook collection|free preview|sample|excerpt|first \d+ chapters|study guide|summary (?:&|and) analysis|special edition|collector's edition|anniversary edition|signed edition|signed stock|trilogy|duology)\b/i;

function normalizeTitle(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Name tokens for the author check: accent-stripped, lowercase, >= 3 letters
// (drops initials like "J." / "K.", which carry no signal).
function authorTokens(s) {
  return new Set(
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  );
}

// Title-only ranking let a same-titled book by a different author win (verified
// case: "Affliction" resolved to a different author's book). A candidate whose
// listed authors share no name token with the seed author gets a penalty large
// enough (an exact title match scores at most 4) to sink it below MIN_ACCEPTABLE_SCORE; a candidate with no listed
// authors is left alone (nothing to compare).
export function authorMismatchPenalty(item, seedAuthor) {
  const listed = (item.volumeInfo || {}).authors;
  if (!seedAuthor || !Array.isArray(listed) || listed.length === 0) return 0;
  const seed = authorTokens(seedAuthor);
  if (seed.size === 0) return 0;
  const cand = authorTokens(listed.join(' '));
  return [...seed].some((w) => cand.has(w)) ? 0 : 5;
}

export function titleMatchScore(item, seedTitle, seedAuthor) {
  const info = item.volumeInfo || {};
  const c = normalizeTitle(info.title || '');
  const s = normalizeTitle(seedTitle || '');
  if (!c || !s) return -Infinity;

  let score = 0;
  if (c === s) score += 3;
  else if (c.startsWith(s) || s.startsWith(c)) score += 2;
  else if (c.includes(s) || s.includes(c)) score += 1;

  const cWords = new Set(c.split(' '));
  const sWords = new Set(s.split(' '));
  const overlap = [...sWords].filter((w) => cWords.has(w)).length;
  score += overlap / Math.max(sWords.size, 1);

  if (WRONG_PRODUCT_PATTERN.test(info.title || '')) score -= 5;
  score -= authorMismatchPenalty(item, seedAuthor);
  // Belt-and-suspenders on top of the langRestrict=en query param — a
  // translated edition can share the exact same title as the English
  // original, so it wouldn't otherwise lose any title-match points, and
  // Google's own `language` tag is occasionally wrong (verified: an
  // Indonesian "Circe" edition self-reported as "en").
  if (info.language && info.language !== 'en') score -= 5;

  // Popular titles are frequently republished/translated many times over,
  // so several candidates often tie on title score alone (verified: Circe,
  // Daughter of Smoke and Bone, and The Wrath and the Dawn all silently
  // ended up on a metadata-only stub edition this way). Break ties toward
  // whichever candidate can actually render a cover, since a tie that loses
  // this way is worse than a tie that loses on nothing user-visible.
  const isStubRecord = item.id && item.id.endsWith('ACAAJ');
  if (isStubRecord) score -= 1;
  if (info.imageLinks) score += 1;

  return score;
}

async function fetchVolumes(apiKey, q) {
  // langRestrict filters at the API level — without it, a same-titled
  // translated edition (e.g. an Indonesian "Circe") can outrank the English
  // original if Google's own relevance ranking favors it (verified: this
  // silently corrupted Circe's description/cover in this catalog). This
  // whole catalog is English-language romantasy, so restricting here is
  // always correct, not just a heuristic.
  const url = `${API_BASE}?q=${encodeURIComponent(q)}&maxResults=5&langRestrict=en&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Books API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.items || [];
}

// A candidate this weak (no real title overlap, or an explicit wrong-product
// match) is worse than no match at all — better to fall back to displaying
// our own seed title than confidently show the wrong book (verified case:
// "Once Bitten" isn't indexed on Google Books under that title for this
// author at all — every candidate for it scores below this bar).
const MIN_ACCEPTABLE_SCORE = 0.5;

async function searchVolumes(apiKey, structuredQuery, unstructuredQuery, seedTitle, seedAuthor) {
  // Try both query forms and pick the best candidate across both result
  // sets — the structured intitle:/inauthor: query can return a handful of
  // wrong-but-nonempty results (so the old "fallback only if empty" logic
  // never reaches the unstructured query even when it has the right book,
  // e.g. an ampersand title variant only the unstructured search finds).
  // PT_GB_SINGLE_QUERY=1 (bulk runs against a tight daily quota): try the
  // structured query alone, and only spend a second query when it yields no
  // acceptable title match. Halves the quota use for the common case.
  let structuredItems, unstructuredItems;
  if (process.env.PT_GB_SINGLE_QUERY === '1') {
    structuredItems = await fetchVolumes(apiKey, structuredQuery);
    const best = structuredItems.map((item) => titleMatchScore(item, seedTitle, seedAuthor)).sort((a, b) => b - a)[0];
    unstructuredItems = best !== undefined && best >= MIN_ACCEPTABLE_SCORE ? [] : await fetchVolumes(apiKey, unstructuredQuery);
  } else {
    [structuredItems, unstructuredItems] = await Promise.all([
      fetchVolumes(apiKey, structuredQuery),
      fetchVolumes(apiKey, unstructuredQuery),
    ]);
  }

  const seen = new Set();
  const allItems = [...structuredItems, ...unstructuredItems].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  if (allItems.length === 0) return null;

  const ranked = allItems
    .map((item) => ({
      item,
      score: titleMatchScore(item, seedTitle, seedAuthor),
    }))
    .sort((a, b) => b.score - a.score);

  if (ranked[0].score < MIN_ACCEPTABLE_SCORE) return null;
  return ranked[0].item;
}

export async function fetchGoogleBooksData(title, author) {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_BOOKS_API_KEY is not set');
  }

  // The strict intitle:/inauthor: query is brittle — e.g. it fails on accented
  // names ("Renee Ahdieh" vs. the catalogued "Renée Ahdieh") or title variants
  // (an ampersand vs. "and"). Query both forms and pick the best-scoring
  // candidate across both result sets rather than trusting either alone.
  const item = await searchVolumes(
    apiKey,
    `intitle:${title} inauthor:${author}`,
    `${title} ${author}`,
    title,
    author
  );
  if (!item) {
    log(`No Google Books match for "${title}" by ${author}`);
    return null;
  }

  const info = item.volumeInfo || {};
  const saleInfo = item.saleInfo || {};
  const images = info.imageLinks || {};
  const rawCoverUrl =
    images.extraLarge || images.large || images.medium || images.small || images.thumbnail || null;
  // Google's public volumes.list response only ever populates `thumbnail`
  // (128x192) for the vast majority of titles — the larger imageLinks fields
  // are essentially never present. Its content server does serve much higher
  // resolution at the same URL for higher `zoom` values (verified: zoom=3 is
  // ~575x863 vs. zoom=1's 128x192), so upgrade whatever URL we got.
  const coverUrl = rawCoverUrl ? rawCoverUrl.replace(/([?&]zoom=)\d+/, '$13') : null;

  const { seriesName, seriesPosition } = parseSeriesFromTitle(info.title || title);

  const editorialReview =
    (item.searchInfo && item.searchInfo.textSnippet) ||
    (info.description && info.description.length > 300 ? null : null);

  return {
    google_books_id: item.id,
    title: (info.title || title).replace(/\s*\([^)]*#\d+\)\s*$/, '').trim(),
    author: (info.authors || [author]).join(', '),
    publisher: info.publisher || null,
    publication_date: info.publishedDate || null,
    page_count: info.pageCount || null,
    description: info.description || '',
    cover_url: coverUrl ? coverUrl.replace('http://', 'https://') : null,
    google_books_link: info.infoLink || saleInfo.buyLink || null,
    avg_rating: info.averageRating ?? null,
    ratings_count: info.ratingsCount ?? null,
    editorial_review: editorialReview,
    series_name: seriesName,
    series_position: seriesPosition,
  };
}
