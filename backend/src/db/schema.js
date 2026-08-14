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
  series_titles TEXT,
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
  darkness_level TEXT,
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

  -- Runs once per never-before-seen seed_title/seed_author pair, before the
  -- Google Books fetch (see seedVerification.js) — a Claude call with live
  -- web search asking "does this book genuinely exist by this author,"
  -- the same check that had to be done by hand across 126 authors to find
  -- 6 hallucinated seed titles that had sat undetected in this catalog.
  -- seed_verification_exists is nullable tri-state (NULL = not yet
  -- checked), not boolean-with-a-default, so a not-yet-verified legacy row
  -- is distinguishable from one that was actually checked and confirmed.
  seed_verified_at TEXT,
  seed_verification_exists INTEGER,
  seed_verification_confidence TEXT, -- 'high' | 'medium' | 'low'
  seed_verification_note TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- UNIQUE is on (book_id, source, author), not url: Hardcover reviews all
-- share one book-level URL (no per-review deep link), so a url-based
-- constraint let INSERT OR IGNORE silently drop every review after the
-- first for a book. A reviewer only reviews a given book once per source,
-- so author is the real natural key here.
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
  UNIQUE(book_id, source, author)
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

-- One shared table for all three menu forms (contact / review / partnership)
-- rather than three near-identical tables — they're all "someone submitted
-- a message, an admin looks at it later," differing only in which optional
-- fields are filled in. book_title is free text, not a books(id) foreign
-- key: a reviewer describing a book they read shouldn't be blocked by
-- fuzzy-matching it to the catalog at submission time.
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- 'contact' | 'review' | 'partnership' | 'correction'
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  book_title TEXT, -- 'review' and 'correction'
  -- 'correction' only — the actual catalog row being flagged. Unlike
  -- book_title (free text a reviewer types), this is set from the book the
  -- reader was actually looking at, so a report can be resolved back to a
  -- specific row without any fuzzy title matching.
  book_id INTEGER REFERENCES books(id),
  -- 'correction' only — coarse category so reports can be triaged by kind
  -- without reading every message first.
  category TEXT,
  -- 'review' only, required, 1-5 — the reviewer's own holistic star
  -- rating. Deliberately separate from the six dimension scores below and
  -- NOT their average: this plays the same role as this app's ★ "real
  -- reader rating" (an independent read) against its ☆ synthesized Quality
  -- Profile score. A reader's overall feeling can genuinely diverge from
  -- the average of the craft dimensions.
  rating INTEGER,
  -- 'review' only, 1-5 each, required together — matches this app's own
  -- six-dimension quality profile rather than a single generic star, since
  -- that's the whole point of the app. Everything else about a review
  -- (subgenre, tropes, spice level, etc.) is derived from our own catalog
  -- data, not asked of the reviewer.
  prose_quality INTEGER,
  romance_quality INTEGER,
  world_building INTEGER,
  pacing_quality INTEGER,
  emotional_payoff INTEGER,
  character_depth INTEGER,
  channel_url TEXT, -- 'partnership' only
  status TEXT NOT NULL DEFAULT 'new', -- 'new' | 'reviewed'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_type ON submissions(type);
CREATE INDEX IF NOT EXISTS idx_books_subgenre ON books(subgenre);
CREATE INDEX IF NOT EXISTS idx_books_series_status ON books(series_status);
CREATE INDEX IF NOT EXISTS idx_reviews_book_id ON reviews(book_id);

-- auditCatalog.js's findings, persisted instead of console-only — each run
-- replaces the prior snapshot (see auditCatalog.js) rather than
-- accumulating duplicates across repeated runs of the same catalog state.
CREATE TABLE IF NOT EXISTS audit_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  severity TEXT NOT NULL, -- 'high' | 'medium' | 'low'
  category TEXT NOT NULL, -- e.g. 'ungrounded-quote', 'wrong-product-match'
  message TEXT NOT NULL,
  book_id INTEGER REFERENCES books(id), -- set when a finding is about one specific book
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'resolved'
  run_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_findings_status ON audit_findings(status);

-- A hand-reviewed disposition, kept separate from audit_findings because
-- that table is fully wiped and rebuilt on every run (see persistFindings
-- in auditCatalog.js) — a category like "thin-romance-content" that's
-- been reviewed once and judged not-a-bug needs that verdict to survive
-- the next 300 re-runs, not get silently reset to "unreviewed" every time
-- the catalog grows. book_id NULL means the disposition applies to the
-- whole category (e.g. "thin-romance-content is by design, see shelf
-- filter"); a specific book_id overrides the category-wide default for
-- that one row (e.g. "this particular zero-rated match is a confirmed
-- Google Books dead end, but don't assume every future one is").
CREATE TABLE IF NOT EXISTS finding_dispositions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  book_id INTEGER REFERENCES books(id),
  disposition TEXT NOT NULL, -- 'needs-fix' | 'accepted'
  note TEXT,
  set_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_finding_dispositions_category ON finding_dispositions(category);
`;
