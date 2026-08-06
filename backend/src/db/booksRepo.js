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
  return profile;
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
    cover_url: row.cover_url || null,
    google_books_link: row.google_books_link || null,
    avg_rating: row.avg_rating ?? null,
    ratings_count: row.ratings_count ?? null,
    editorial_review: row.editorial_review || null,

    series_name: row.series_name || null,
    series_position: row.series_position ?? null,
    series_total: row.series_total ?? null,
    series_complete: row.series_complete == null ? null : Boolean(row.series_complete),
    next_release_date: row.next_release_date || null,

    series_status: row.series_status || null,
    subgenre: row.subgenre || null,
    romance_tropes: parseJsonArray(row.romance_tropes),
    plot_tropes: parseJsonArray(row.plot_tropes),
    spice_level: row.spice_level || null,
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
    qp.review_count_used, qp.overall_confidence
  FROM books b
  LEFT JOIN quality_profiles qp ON qp.book_id = b.id
`;

const selectAllBooks = db.prepare(SELECT_SQL);
const selectBookById = db.prepare(`${SELECT_SQL} WHERE b.id = ?`);

export function getAllBooks() {
  return selectAllBooks.all().map(serializeBook);
}

export function getBookById(id) {
  const row = selectBookById.get(id);
  return row ? serializeBook(row) : null;
}
