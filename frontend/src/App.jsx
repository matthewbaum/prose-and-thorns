import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Header from './components/Header.jsx';
import FilterPanel from './components/FilterPanel.jsx';
import BookGrid from './components/BookGrid.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import HomePage from './components/HomePage.jsx';
import AboutPage from './components/AboutPage.jsx';
import BookPicker from './components/BookPicker.jsx';
import QualityFilterPicker from './components/QualityFilterPicker.jsx';
import { fetchBooks, fetchBook, fetchRecommendations } from './api.js';
import { SORT_OPTIONS, RECOMMEND_SORT_OPTIONS } from './constants/taxonomy.js';
import './styles/App.css';

const PAGE_SIZE = 24;

const DEFAULT_FILTERS = {
  series_status: [],
  age_category: [],
  publisher_type: [],
  series_length: [],
  subgenre: [],
  romance_tropes: [],
  plot_tropes: [],
  spice_level: [],
  darkness_level: [],
  min_prose: 1,
  min_romance: 1,
  min_world_building: 1,
  min_pacing: 1,
  min_emotional_payoff: 1,
  min_character_depth: 1,
  min_overall: 1,
  exclude_warnings: [],
  sort: 'best-match',
};

export default function App() {
  const [view, setView] = useState('home');

  // A SPA view switch doesn't reset scroll position the way a real page
  // navigation would — verified case: submitting a search from partway
  // down the Home page landed on Browse/Recommend still scrolled to that
  // same position, so the result count in the header was off-screen above
  // the fold until the reader scrolled up manually.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [books, setBooks] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedBook, setSelectedBook] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [recommendSeeds, setRecommendSeeds] = useState([]);
  const [recommendSeedIds, setRecommendSeedIds] = useState([]);
  const [recommendMode, setRecommendMode] = useState('any');
  const [recommendNoCommonGround, setRecommendNoCommonGround] = useState(false);
  const [recommendCommonGround, setRecommendCommonGround] = useState([]);
  const [recommendSort, setRecommendSort] = useState('match');
  const [recommendQualityFilters, setRecommendQualityFilters] = useState([]);

  // "Home" and plain "Browse all" both mean a clean slate — neither should
  // silently carry over filters left set from an earlier Quick Search or
  // recommendation. Only actions that explicitly set filters (Quick Search,
  // FilterPanel edits) should populate them.
  const goHome = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setRecommendSort('match');
    setRecommendQualityFilters([]);
    setView('home');
  }, []);
  const goBrowse = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setView('browse');
  }, []);
  const goAbout = useCallback(() => setView('about'), []);

  // Reset to page 1 whenever filters change or the browse view is entered.
  useEffect(() => {
    if (view !== 'browse') return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOffset(0);
    fetchBooks({ ...filters, limit: PAGE_SIZE, offset: 0 })
      .then((data) => {
        if (cancelled) return;
        setBooks(data.books || []);
        setTotal(data.total || 0);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, view]);

  const loadMore = useCallback(() => {
    const nextOffset = offset + PAGE_SIZE;
    setLoadingMore(true);
    fetchBooks({ ...filters, limit: PAGE_SIZE, offset: nextOffset })
      .then((data) => {
        setBooks((prev) => [...prev, ...(data.books || [])]);
        setOffset(nextOffset);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingMore(false));
  }, [filters, offset]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedBook(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetchBook(selectedId)
      .then((data) => {
        if (!cancelled) setSelectedBook(data);
      })
      .catch(() => {
        if (!cancelled) setSelectedBook(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const updateFilters = useCallback((patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const handleQuickSearch = useCallback((patch) => {
    setFilters({ ...DEFAULT_FILTERS, ...patch });
    setView('browse');
  }, []);

  const runRecommend = useCallback((ids, mode, sort = 'match', qualityFilters = []) => {
    setView('recommend');
    setLoading(true);
    setError(null);
    setRecommendMode(mode);
    setRecommendSort(sort);
    setRecommendQualityFilters(qualityFilters);
    fetchRecommendations(ids, mode, sort, qualityFilters)
      .then((data) => {
        setBooks(data.books || []);
        setTotal((data.books || []).length);
        setRecommendSeeds(data.seeds || []);
        // Set together with recommendSeeds (same batch) rather than
        // synchronously above — the BookPicker below remounts on this id
        // list changing (via its `key`), and it reads recommendSeeds as its
        // initial chip state on mount. Setting this before the fetch
        // resolved caused the remount to fire a render early, off the
        // still-stale recommendSeeds from the *previous* search, so the
        // chips came up empty even though the right data arrived a moment
        // later — useState's initial value is only ever read once.
        setRecommendSeedIds(ids);
        setRecommendNoCommonGround(Boolean(data.noCommonGround));
        setRecommendCommonGround(data.commonGround || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Editing seeds in place (see BookPicker below) should keep whatever sort
  // and quality filters the reader already picked, not silently reset them.
  // A fresh search from Home has no prior quality filters (that control
  // only lives on this results page), so recommendQualityFilters is
  // correctly [] the first time through.
  const handleRecommend = useCallback(
    (ids, mode) => runRecommend(ids, mode, recommendSort, recommendQualityFilters),
    [runRecommend, recommendSort, recommendQualityFilters]
  );
  const handleRecommendSortChange = useCallback(
    (sort) => runRecommend(recommendSeedIds, recommendMode, sort, recommendQualityFilters),
    [runRecommend, recommendSeedIds, recommendMode, recommendQualityFilters]
  );
  // Same instant-apply pattern as the any/all mode toggle — a quality
  // filter that only staged until some other click applied it would read
  // as broken the same way the mode toggle did.
  const handleRecommendQualityChange = useCallback(
    (qualityFilters) => runRecommend(recommendSeedIds, recommendMode, recommendSort, qualityFilters),
    [runRecommend, recommendSeedIds, recommendMode, recommendSort]
  );

  const bodyLocked = useMemo(() => Boolean(selectedId) || sidebarOpen, [selectedId, sidebarOpen]);

  useEffect(() => {
    document.body.style.overflow = bodyLocked ? 'hidden' : '';
  }, [bodyLocked]);

  const hasMore = books.length < total;

  return (
    <div className="app-shell">
      <Header
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        view={view}
        onNavigateHome={goHome}
        onNavigateBrowse={goBrowse}
        onNavigateAbout={goAbout}
        onSelectBook={(id) => setSelectedId(id)}
      />
      {view === 'home' ? (
        <main className="app-main">
          <HomePage
            onSelectBook={(id) => setSelectedId(id)}
            onBrowseAll={goBrowse}
            onQuickSearch={handleQuickSearch}
            onRecommend={handleRecommend}
          />
        </main>
      ) : view === 'about' ? (
        <main className="app-main">
          <AboutPage onBrowseAll={goBrowse} />
        </main>
      ) : view === 'recommend' ? (
        <main className="app-main">
          {error && <div className="error-banner">Couldn&apos;t load recommendations: {error}</div>}
          <div className="recommend-header">
            <h2 className="recommend-title">
              Because you liked{' '}
              {recommendSeeds.map((s, i) => (
                <React.Fragment key={s.id}>
                  {i > 0 && (i === recommendSeeds.length - 1 ? ' and ' : ', ')}
                  <em>{s.title}</em>
                </React.Fragment>
              ))}
            </h2>
            <button className="link-btn" onClick={goHome}>
              Start over
            </button>
          </div>
          {/* Editable in place — add/remove a seed or flip any/all mode and
              re-run without losing your picks. "Start over" above is now
              only for a genuine clean slate, not the only way to tweak a
              search. Keyed on the seed id list so picking an entirely new
              set from Home (a fresh navigation into this view) remounts
              with the new seeds instead of carrying over stale local
              picker state from a previous recommend session. */}
          <BookPicker
            key={recommendSeedIds.join(',')}
            initialSelected={recommendSeeds}
            initialMode={recommendMode}
            onRecommend={handleRecommend}
            submitLabel="Update recommendations"
          />
          <QualityFilterPicker
            value={recommendQualityFilters}
            onChange={handleRecommendQualityChange}
            label="Only want matches that clear a quality bar? Set your minimum:"
          />
          {recommendMode === 'all' && !recommendNoCommonGround && recommendCommonGround.length > 0 && (
            <p className="common-ground-summary">
              All picks share:{' '}
              {recommendCommonGround.map((g, i) => (
                <React.Fragment key={g.key}>
                  {i > 0 && ', '}
                  <strong>{g.label}</strong>
                </React.Fragment>
              ))}
            </p>
          )}
          {!loading && books.length > 0 && (
            <div className="recommend-sort-row">
              <label className="sort-label" htmlFor="recommend-sort-select">
                Sort by
                <select
                  id="recommend-sort-select"
                  className="sort-select"
                  value={recommendSort}
                  onChange={(e) => handleRecommendSortChange(e.target.value)}
                >
                  {RECOMMEND_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              {total > 0 && (
                <span className="result-count">
                  {total} book{total === 1 ? '' : 's'}
                </span>
              )}
            </div>
          )}
          <BookGrid
            books={books}
            loading={loading}
            onSelect={(id) => setSelectedId(id)}
            filters={null}
            matchLabel={recommendMode === 'all' ? 'In common' : 'Matches on'}
            emptyTitle={
              recommendNoCommonGround
                ? "Your picks don't share a tagged subgenre or trope in common."
                : 'No close matches found in the catalog yet.'
            }
            emptySub={
              recommendNoCommonGround
                ? 'Try "Similar to any of these" instead, or pick books that are more alike.'
                : 'Try picking a different book, or one with more tropes/subgenre tagged.'
            }
          />
        </main>
      ) : (
        <div className="app-layout">
          <FilterPanel
            filters={filters}
            onChange={updateFilters}
            onReset={resetFilters}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
          <main className="app-main">
            {error && <div className="error-banner">Couldn&apos;t load books: {error}</div>}
            <div className="browse-header">
              <button className="link-btn" onClick={goHome}>
                &larr; Start over
              </button>
              <div className="browse-header-sort-group">
                <label className="sort-label" htmlFor="sort-select">
                  Sort by
                  <select
                    id="sort-select"
                    className="sort-select"
                    value={filters.sort}
                    onChange={(e) => updateFilters({ sort: e.target.value })}
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                {total > 0 && (
                  <span className="result-count">
                    {total} book{total === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
            <BookGrid
              books={books}
              loading={loading}
              onSelect={(id) => setSelectedId(id)}
              filters={filters}
            />
            {!loading && hasMore && (
              <button className="load-more-btn" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more books'}
              </button>
            )}
          </main>
        </div>
      )}
      <DetailPanel
        book={selectedBook}
        loading={detailLoading}
        onClose={() => setSelectedId(null)}
        onSelectBook={(id) => setSelectedId(id)}
      />
    </div>
  );
}
