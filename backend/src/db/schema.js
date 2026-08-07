export const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seed_title TEXT NOT NULL,
  seed_author TEXT NOT NULL,
  google_books_id TEXT UNIQUE,
  title TEXT,
  author TEXT,
  publisher TEXT,
  publication_date TEXT,
  page_count INTEGER,
  description TEXT,
  cover_url TEXT,
  google_books_link TEXT,
  avg_rating REAL,
  ratings_count INTEGER,
  editorial_review TEXT,

  series_name TEXT,
  series_position INTEGER,
  series_total INTEGER,
  series_complete INTEGER,
  next_release_date TEXT,

  series_status TEXT,
  age_category TEXT,
  publisher_type TEXT,
  synopsis TEXT,
  praise TEXT DEFAULT '[]',
  subgenre TEXT,
  romance_tropes TEXT DEFAULT '[]',
  plot_tropes TEXT DEFAULT '[]',
  spice_level TEXT,
  lgbtq TEXT,
  content_warnings TEXT DEFAULT '[]',
  emotional_tone TEXT,
  pacing TEXT,
  tagging_confidence TEXT,
  sponsored INTEGER NOT NULL DEFAULT 0,

  google_books_fetched_at TEXT,
  reddit_fetched_at TEXT,
  hardcover_fetched_at TEXT,
  hardcover_avg_rating REAL,
  hardcover_ratings_count INTEGER,
  hardcover_cover_url TEXT,
  hardcover_url TEXT,
  tagged_at TEXT,
  quality_synthesized_at TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  source TEXT NOT NULL, -- 'reddit' | 'google_books'
  subreddit TEXT,
  author TEXT,
  text TEXT NOT NULL,
  score INTEGER,
  url TEXT,
  permalink TEXT,
  fetched_at TEXT DEFAULT (datetime('now')),
  UNIQUE(book_id, source, url)
);

CREATE TABLE IF NOT EXISTS quality_profiles (
  book_id INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  prose_quality_score INTEGER,
  prose_quality_synthesis TEXT,
  prose_quality_quote TEXT,
  prose_quality_confidence TEXT,

  romance_quality_score INTEGER,
  romance_quality_synthesis TEXT,
  romance_quality_quote TEXT,
  romance_quality_confidence TEXT,

  world_building_score INTEGER,
  world_building_synthesis TEXT,
  world_building_quote TEXT,
  world_building_confidence TEXT,

  pacing_quality_score INTEGER,
  pacing_quality_synthesis TEXT,
  pacing_quality_quote TEXT,
  pacing_quality_confidence TEXT,

  emotional_payoff_score INTEGER,
  emotional_payoff_synthesis TEXT,
  emotional_payoff_quote TEXT,
  emotional_payoff_confidence TEXT,

  character_depth_score INTEGER,
  character_depth_synthesis TEXT,
  character_depth_quote TEXT,
  character_depth_confidence TEXT,

  prose_style TEXT,
  prose_style_note TEXT,
  grammar_flag TEXT,
  grammar_note TEXT,
  dialogue_flag TEXT,
  dialogue_note TEXT,

  review_count_used INTEGER DEFAULT 0,
  overall_confidence TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- No auth/user system exists yet. This anticipates one: user_id is a free-text
-- placeholder key today (not a foreign key to anything), reserved for a future
-- accounts table. Not read or written anywhere in the app yet.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  show_sponsored INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_books_subgenre ON books(subgenre);
CREATE INDEX IF NOT EXISTS idx_books_series_status ON books(series_status);
CREATE INDEX IF NOT EXISTS idx_reviews_book_id ON reviews(book_id);
`;
