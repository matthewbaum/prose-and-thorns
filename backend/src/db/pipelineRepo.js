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

// series_name/series_position are also written by the tagging stage (a more
// reliable, LLM-extracted source vs. this stage's regex parse of the title
// string) — COALESCE so re-running this stage alone (e.g. to retry a cover
// match) can't silently blank out a better value tagging already set, since
// re-running doesn't re-run tagging too unless tagged_at is separately reset.
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
    series_name = COALESCE(@series_name, series_name),
    series_position = COALESCE(@series_position, series_position),
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

const markHardcoverFetched = db.prepare(
  `UPDATE books SET
    hardcover_fetched_at = datetime('now'),
    hardcover_avg_rating = @avg_rating,
    hardcover_ratings_count = @ratings_count,
    hardcover_cover_url = @cover_url,
    hardcover_url = @hardcover_url,
    updated_at = datetime('now')
  WHERE id = @id`
);

export function saveHardcoverReviews(bookId, { avgRating, ratingsCount, coverUrl, hardcoverUrl, reviews }) {
  insertReviewsTx(
    reviews.map((r) => ({ book_id: bookId, subreddit: null, permalink: null, ...r }))
  );
  markHardcoverFetched.run({
    id: bookId,
    avg_rating: avgRating,
    ratings_count: ratingsCount,
    cover_url: coverUrl ?? null,
    hardcover_url: hardcoverUrl ?? null,
  });
}

export function markHardcoverMissing(bookId) {
  markHardcoverFetched.run({ id: bookId, avg_rating: null, ratings_count: null, cover_url: null, hardcover_url: null });
}

const selectReviewsForBook = db.prepare('SELECT * FROM reviews WHERE book_id = ? ORDER BY score DESC');

export function getReviewsForBook(bookId) {
  return selectReviewsForBook.all(bookId);
}

// series_position/series_total/series_name are COALESCE'd with the existing
// DB value taking priority, not the freshly-tagged one — verified case: a
// re-tag pass (e.g. to backfill a new field like darkness_level) reset
// tagged_at for the whole catalog, and tagBook()'s per-book, independently
// guessed series_total immediately re-introduced the exact
// sibling-disagreement bug that a centralized, cross-checked backfill had
// already fixed (Throne of Glass, Dark Olympus, etc. went right back to
// disagreeing). These three fields are inherently ungrounded (the model's
// own knowledge, not derived from this book's description), so once a
// value is set — by any source — it should be sticky against a later
// re-tag; only a dedicated backfill/correction script should change it.
const updateTags = db.prepare(
  `UPDATE books SET
    series_status = @series_status,
    age_category = @age_category,
    publisher_type = @publisher_type,
    synopsis = @synopsis,
    praise = @praise,
    series_position = COALESCE(series_position, @series_position),
    series_total = COALESCE(series_total, @series_total),
    series_complete = @series_complete,
    series_name = COALESCE(series_name, @series_name),
    subgenre = @subgenre,
    romance_tropes = @romance_tropes,
    plot_tropes = @plot_tropes,
    spice_level = @spice_level,
    darkness_level = @darkness_level,
    lgbtq = @lgbtq,
    content_warnings = @content_warnings,
    emotional_tone = @emotional_tone,
    pacing = @pacing,
    tagging_confidence = @tagging_confidence,
    tagged_at = datetime('now'),
    updated_at = datetime('now')
  WHERE id = @id`
);

const COMPLETE_STATUSES = new Set(['standalone', 'series-complete', 'duology-complete']);
const ONGOING_STATUSES = new Set(['series-ongoing', 'duology-ongoing']);

// "chosen-one" is defined in the romance-trope taxonomy but the model
// repeatedly puts it in plot_tropes instead — verified recurring across
// three separate full-catalog re-tag passes (4, then 11, then 12 books
// each time, never the same books twice), not a one-off fluke. Since its
// correct bucket is fixed and known, correct it at write time instead of
// re-flagging and hand-fixing it after every future re-tag.
function normalizeTropeBuckets(romanceTropes, plotTropes) {
  const romance = new Set(romanceTropes);
  const plot = plotTropes.filter((t) => t !== 'chosen-one');
  if (plotTropes.includes('chosen-one')) romance.add('chosen-one');
  return { romance: [...romance], plot };
}

export function saveTags(bookId, tags) {
  let seriesComplete = null;
  if (COMPLETE_STATUSES.has(tags.series_status)) seriesComplete = 1;
  else if (ONGOING_STATUSES.has(tags.series_status)) seriesComplete = 0;

  const { romance: fixedRomanceTropes, plot: fixedPlotTropes } = normalizeTropeBuckets(
    tags.romance_tropes || [],
    tags.plot_tropes || []
  );

  updateTags.run({
    id: bookId,
    series_status: tags.series_status || null,
    age_category: tags.age_category || null,
    publisher_type: tags.publisher_type || null,
    synopsis: tags.synopsis || null,
    praise: JSON.stringify(tags.praise || []),
    series_position: tags.series_position ?? null,
    series_total: tags.series_total ?? null,
    series_complete: seriesComplete,
    series_name: tags.series_name || null,
    subgenre: tags.subgenre || null,
    romance_tropes: JSON.stringify(fixedRomanceTropes),
    plot_tropes: JSON.stringify(fixedPlotTropes),
    spice_level: tags.spice_level || null,
    darkness_level: tags.darkness_level || null,
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
    prose_style, prose_style_note, grammar_flag, grammar_note, dialogue_flag, dialogue_note,
    review_count_used, overall_confidence, updated_at
  ) VALUES (
    @book_id,
    @prose_quality_score, @prose_quality_synthesis, @prose_quality_quote, @prose_quality_confidence,
    @romance_quality_score, @romance_quality_synthesis, @romance_quality_quote, @romance_quality_confidence,
    @world_building_score, @world_building_synthesis, @world_building_quote, @world_building_confidence,
    @pacing_quality_score, @pacing_quality_synthesis, @pacing_quality_quote, @pacing_quality_confidence,
    @emotional_payoff_score, @emotional_payoff_synthesis, @emotional_payoff_quote, @emotional_payoff_confidence,
    @character_depth_score, @character_depth_synthesis, @character_depth_quote, @character_depth_confidence,
    @prose_style, @prose_style_note, @grammar_flag, @grammar_note, @dialogue_flag, @dialogue_note,
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
    prose_style = excluded.prose_style,
    prose_style_note = excluded.prose_style_note,
    grammar_flag = excluded.grammar_flag,
    grammar_note = excluded.grammar_note,
    dialogue_flag = excluded.dialogue_flag,
    dialogue_note = excluded.dialogue_note,
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
    prose_style: profile.writing_style?.style || null,
    prose_style_note: profile.writing_style?.note || null,
    grammar_flag: profile.grammar_technical?.flag || null,
    grammar_note: profile.grammar_technical?.note || null,
    dialogue_flag: profile.dialogue_realism?.flag || null,
    dialogue_note: profile.dialogue_realism?.note || null,
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
