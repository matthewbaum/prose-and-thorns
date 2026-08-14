import db from './index.js';
import { QUALITY_DIMENSIONS } from '../constants.js';

function parseJsonArray(text) {
  if (!text) return [];
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function buildQualityProfile(row) {
  const hasProfile = QUALITY_DIMENSIONS.some((dim) => row[`${dim}_score`] != null);
  if (!hasProfile) return null;

  const profile = {};
  let sum = 0;
  let count = 0;

  for (const dim of QUALITY_DIMENSIONS) {
    const score = row[`${dim}_score`];
    profile[dim] = {
      score: score ?? 0,
      synthesis: row[`${dim}_synthesis`] || '',
      representative_quote: row[`${dim}_quote`] || '',
      confidence: row[`${dim}_confidence`] || 'low',
    };
    if (score != null) {
      sum += score;
      count += 1;
    }
  }

  profile.overall_score = count > 0 ? sum / count : null;
  profile.review_count_used = row.review_count_used || 0;
  profile.confidence = row.overall_confidence || 'low';

  if (row.prose_style) {
    profile.writing_style = { style: row.prose_style, note: row.prose_style_note || '' };
  }
  if (row.grammar_flag) {
    profile.grammar_technical = { flag: row.grammar_flag, note: row.grammar_note || '' };
  }
  if (row.dialogue_flag) {
    profile.dialogue_realism = { flag: row.dialogue_flag, note: row.dialogue_note || '' };
  }

  return profile;
}

// Google Books IDs ending "ACAAJ" are metadata-only stub records with no
// digitized content — their imageLinks.thumbnail resolves to a generic
// "image not available" graphic, not real cover art, even though the URL
// itself looks valid. Prefer Hardcover's cover (real edition art, and much
// better matched overall) whenever we have it; only fall back to Google's
// when Hardcover has nothing and Google's own ID isn't a known-bad stub.
export function resolveCoverUrl(row) {
  if (row.hardcover_cover_url) return row.hardcover_cover_url;
  const isStubRecord = row.google_books_id && row.google_books_id.endsWith('ACAAJ');
  return isStubRecord ? null : row.cover_url || null;
}

function serializeBook(row) {
  const quality_profile = buildQualityProfile(row);
  return {
    id: row.id,
    title: row.title || row.seed_title,
    author: row.author || row.seed_author,
    publisher: row.publisher || null,
    publication_date: row.publication_date || null,
    page_count: row.page_count || null,
    description: row.description || '',
    synopsis: row.synopsis || null,
    praise: parseJsonArray(row.praise),
    cover_url: resolveCoverUrl(row),
    google_books_link: row.google_books_link || null,
    avg_rating: row.avg_rating ?? null,
    ratings_count: row.ratings_count ?? null,
    hardcover_avg_rating: row.hardcover_avg_rating ?? null,
    hardcover_ratings_count: row.hardcover_ratings_count ?? null,
    hardcover_url: row.hardcover_url || null,
    editorial_review: row.editorial_review || null,

    series_name: row.series_name || null,
    series_position: row.series_position ?? null,
    series_total: row.series_total ?? null,
    series_complete: row.series_complete == null ? null : Boolean(row.series_complete),
    series_titles: parseJsonArray(row.series_titles),
    next_release_date: row.next_release_date || null,

    series_status: row.series_status || null,
    age_category: row.age_category || null,
    publisher_type: row.publisher_type || null,
    subgenre: row.subgenre || null,
    romance_tropes: parseJsonArray(row.romance_tropes),
    plot_tropes: parseJsonArray(row.plot_tropes),
    spice_level: row.spice_level || null,
    darkness_level: row.darkness_level || null,
    lgbtq: row.lgbtq || 'unknown',
    content_warnings: parseJsonArray(row.content_warnings),
    emotional_tone: row.emotional_tone || null,
    pacing: row.pacing || null,
    tagging_confidence: row.tagging_confidence || null,

    quality_profile,
    overall_score: quality_profile ? quality_profile.overall_score : null,
  };
}

const SELECT_SQL = `
  SELECT b.*,
    qp.prose_quality_score, qp.prose_quality_synthesis, qp.prose_quality_quote, qp.prose_quality_confidence,
    qp.romance_quality_score, qp.romance_quality_synthesis, qp.romance_quality_quote, qp.romance_quality_confidence,
    qp.world_building_score, qp.world_building_synthesis, qp.world_building_quote, qp.world_building_confidence,
    qp.pacing_quality_score, qp.pacing_quality_synthesis, qp.pacing_quality_quote, qp.pacing_quality_confidence,
    qp.emotional_payoff_score, qp.emotional_payoff_synthesis, qp.emotional_payoff_quote, qp.emotional_payoff_confidence,
    qp.character_depth_score, qp.character_depth_synthesis, qp.character_depth_quote, qp.character_depth_confidence,
    qp.prose_style, qp.prose_style_note, qp.grammar_flag, qp.grammar_note, qp.dialogue_flag, qp.dialogue_note,
    qp.review_count_used, qp.overall_confidence
  FROM books b
  LEFT JOIN quality_profiles qp ON qp.book_id = b.id
`;

// Excludes books with zero rating/review substance anywhere (no Google
// Books rating, no Hardcover rating, no scraped reviews) from every
// listing surface — browse, search, shelves, and recommendation
// candidates. Verified case: newly-added sequels for not-yet-released or
// just-released books (e.g. "Seven and the Swift", pub. 2027) showed up as
// blank, ratingless cards. Deliberately automatic rather than a one-time
// manual removal — a book naturally starts appearing again on its own,
// with no code change needed, the moment real review data exists for it
// (whether that's from a review scrape after release, or a wrong-product
// match getting corrected and re-fetched).
const NO_SUBSTANCE_CLAUSE = `
  NOT (
    b.avg_rating IS NULL
    AND b.hardcover_avg_rating IS NULL
    AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.book_id = b.id)
  )
`;

const selectAllBooks = db.prepare(`${SELECT_SQL} WHERE ${NO_SUBSTANCE_CLAUSE}`);
const selectBookById = db.prepare(`${SELECT_SQL} WHERE b.id = ?`);
const selectSeriesSiblings = db.prepare(`
  SELECT id, title, seed_title, author, seed_author, series_position,
    cover_url, hardcover_cover_url, google_books_id
  FROM books
  WHERE series_name = ? AND id != ?
  ORDER BY series_position ASC
`);

export function getAllBooks() {
  return selectAllBooks.all().map(serializeBook);
}

export function getBookById(id) {
  const row = selectBookById.get(id);
  if (!row) return null;
  const book = serializeBook(row);

  if (book.series_name) {
    book.series_books = selectSeriesSiblings.all(book.series_name, id).map((sibling) => ({
      id: sibling.id,
      title: sibling.title || sibling.seed_title,
      author: sibling.author || sibling.seed_author,
      series_position: sibling.series_position ?? null,
      cover_url: resolveCoverUrl(sibling),
    }));
  }

  return book;
}
