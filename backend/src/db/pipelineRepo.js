import db from './index.js';

// Statements are prepared once at module load and reused — repeatedly calling
// db.prepare() inside a long-running loop piles up native Statement objects
// faster than V8 can collect them, which crashed a 99-book pipeline run
// partway through with a GC/native-addon assertion failure.

const selectBookBySeed = db.prepare('SELECT * FROM books WHERE seed_title = ? AND seed_author = ?');
const insertBookBySeed = db.prepare('INSERT INTO books (seed_title, seed_author) VALUES (?, ?)');
const selectBookById = db.prepare('SELECT * FROM books WHERE id = ?');

export function findOrCreateBook(seedTitle, seedAuthor) {
  const existing = selectBookBySeed.get(seedTitle, seedAuthor);
  if (existing) return existing;

  const info = insertBookBySeed.run(seedTitle, seedAuthor);
  return selectBookById.get(info.lastInsertRowid);
}

const updateGoogleBooksData = db.prepare(
  `UPDATE books SET
    google_books_id = @google_books_id,
    title = @title,
    author = @author,
    publisher = @publisher,
    publication_date = @publication_date,
    page_count = @page_count,
    description = @description,
    cover_url = @cover_url,
    google_books_link = @google_books_link,
    avg_rating = @avg_rating,
    ratings_count = @ratings_count,
    editorial_review = @editorial_review,
    series_name = @series_name,
    series_position = @series_position,
    google_books_fetched_at = datetime('now'),
    updated_at = datetime('now')
  WHERE id = @id`
);

export function saveGoogleBooksData(bookId, data) {
  updateGoogleBooksData.run({ ...data, id: bookId });
}

const markGoogleBooksMissingStmt = db.prepare(
  `UPDATE books SET google_books_fetched_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
);

export function markGoogleBooksMissing(bookId) {
  markGoogleBooksMissingStmt.run(bookId);
}

const insertReview = db.prepare(
  `INSERT OR IGNORE INTO reviews (book_id, source, subreddit, author, text, score, url, permalink)
   VALUES (@book_id, @source, @subreddit, @author, @text, @score, @url, @permalink)`
);
const insertReviewsTx = db.transaction((rows) => {
  for (const row of rows) insertReview.run(row);
});
const markRedditFetched = db.prepare(
  `UPDATE books SET reddit_fetched_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
);

export function saveReviews(bookId, reviews) {
  insertReviewsTx(reviews.map((r) => ({ book_id: bookId, ...r })));
  markRedditFetched.run(bookId);
}

const selectReviewsForBook = db.prepare('SELECT * FROM reviews WHERE book_id = ? ORDER BY score DESC');

export function getReviewsForBook(bookId) {
  return selectReviewsForBook.all(bookId);
}

const updateTags = db.prepare(
  `UPDATE books SET
    series_status = @series_status,
    subgenre = @subgenre,
    romance_tropes = @romance_tropes,
    plot_tropes = @plot_tropes,
    spice_level = @spice_level,
    lgbtq = @lgbtq,
    content_warnings = @content_warnings,
    emotional_tone = @emotional_tone,
    pacing = @pacing,
    tagging_confidence = @tagging_confidence,
    tagged_at = datetime('now'),
    updated_at = datetime('now')
  WHERE id = @id`
);

export function saveTags(bookId, tags) {
  updateTags.run({
    id: bookId,
    series_status: tags.series_status || null,
    subgenre: tags.subgenre || null,
    romance_tropes: JSON.stringify(tags.romance_tropes || []),
    plot_tropes: JSON.stringify(tags.plot_tropes || []),
    spice_level: tags.spice_level || null,
    lgbtq: tags.lgbtq || 'unknown',
    content_warnings: JSON.stringify(tags.content_warnings || []),
    emotional_tone: tags.emotional_tone || null,
    pacing: tags.pacing || null,
    tagging_confidence: tags.confidence || null,
  });
}

const upsertQualityProfile = db.prepare(
  `INSERT INTO quality_profiles (
    book_id,
    prose_quality_score, prose_quality_synthesis, prose_quality_quote, prose_quality_confidence,
    romance_quality_score, romance_quality_synthesis, romance_quality_quote, romance_quality_confidence,
    world_building_score, world_building_synthesis, world_building_quote, world_building_confidence,
    pacing_quality_score, pacing_quality_synthesis, pacing_quality_quote, pacing_quality_confidence,
    emotional_payoff_score, emotional_payoff_synthesis, emotional_payoff_quote, emotional_payoff_confidence,
    character_depth_score, character_depth_synthesis, character_depth_quote, character_depth_confidence,
    review_count_used, overall_confidence, updated_at
  ) VALUES (
    @book_id,
    @prose_quality_score, @prose_quality_synthesis, @prose_quality_quote, @prose_quality_confidence,
    @romance_quality_score, @romance_quality_synthesis, @romance_quality_quote, @romance_quality_confidence,
    @world_building_score, @world_building_synthesis, @world_building_quote, @world_building_confidence,
    @pacing_quality_score, @pacing_quality_synthesis, @pacing_quality_quote, @pacing_quality_confidence,
    @emotional_payoff_score, @emotional_payoff_synthesis, @emotional_payoff_quote, @emotional_payoff_confidence,
    @character_depth_score, @character_depth_synthesis, @character_depth_quote, @character_depth_confidence,
    @review_count_used, @overall_confidence, datetime('now')
  )
  ON CONFLICT(book_id) DO UPDATE SET
    prose_quality_score = excluded.prose_quality_score,
    prose_quality_synthesis = excluded.prose_quality_synthesis,
    prose_quality_quote = excluded.prose_quality_quote,
    prose_quality_confidence = excluded.prose_quality_confidence,
    romance_quality_score = excluded.romance_quality_score,
    romance_quality_synthesis = excluded.romance_quality_synthesis,
    romance_quality_quote = excluded.romance_quality_quote,
    romance_quality_confidence = excluded.romance_quality_confidence,
    world_building_score = excluded.world_building_score,
    world_building_synthesis = excluded.world_building_synthesis,
    world_building_quote = excluded.world_building_quote,
    world_building_confidence = excluded.world_building_confidence,
    pacing_quality_score = excluded.pacing_quality_score,
    pacing_quality_synthesis = excluded.pacing_quality_synthesis,
    pacing_quality_quote = excluded.pacing_quality_quote,
    pacing_quality_confidence = excluded.pacing_quality_confidence,
    emotional_payoff_score = excluded.emotional_payoff_score,
    emotional_payoff_synthesis = excluded.emotional_payoff_synthesis,
    emotional_payoff_quote = excluded.emotional_payoff_quote,
    emotional_payoff_confidence = excluded.emotional_payoff_confidence,
    character_depth_score = excluded.character_depth_score,
    character_depth_synthesis = excluded.character_depth_synthesis,
    character_depth_quote = excluded.character_depth_quote,
    character_depth_confidence = excluded.character_depth_confidence,
    review_count_used = excluded.review_count_used,
    overall_confidence = excluded.overall_confidence,
    updated_at = datetime('now')`
);

const markQualitySynthesized = db.prepare(
  `UPDATE books SET quality_synthesized_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
);

export function saveQualityProfile(bookId, profile) {
  const dims = [
    'prose_quality',
    'romance_quality',
    'world_building',
    'pacing_quality',
    'emotional_payoff',
    'character_depth',
  ];

  const params = {
    book_id: bookId,
    review_count_used: profile.review_count_used || 0,
    overall_confidence: profile.confidence || 'low',
  };
  for (const dim of dims) {
    const d = profile[dim] || {};
    params[`${dim}_score`] = d.score ?? null;
    params[`${dim}_synthesis`] = d.synthesis || null;
    params[`${dim}_quote`] = d.representative_quote || null;
    params[`${dim}_confidence`] = profile.confidence || 'low';
  }

  upsertQualityProfile.run(params);
  markQualitySynthesized.run(bookId);
}
