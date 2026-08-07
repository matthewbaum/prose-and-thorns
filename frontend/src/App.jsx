import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Header from './components/Header.jsx';
import FilterPanel from './components/FilterPanel.jsx';
import BookGrid from './components/BookGrid.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import HomePage from './components/HomePage.jsx';
import AboutPage from './components/AboutPage.jsx';
import { fetchBooks, fetchBook, fetchRecommendations } from './api.js';
import './styles/App.css';

const PAGE_SIZE = 24;

const DEFAULT_FILTERS = {
  series_status: 'any',
  age_category: 'any',
  publisher_type: 'any',
  series_length: [],
  subgenre: [],
  romance_tropes: [],
  plot_tropes: [],
  spice_min: '',
  spice_max: '',
  min_prose: 1,
  min_romance: 1,
  min_world_building: 1,
  min_emotional_payoff: 1,
  min_overall: 1,
  exclude_warnings: [],
  sort: 'best-match',
};

export default function App() {
  const [view, setView] = useState('home');
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

  const goHome = useCallback(() => setView('home'), []);
  const goBrowse = useCallback(() => setView('browse'), []);
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

  const runRecommend = useCallback((ids, mode) => {
    setView('recommend');
    setLoading(true);
    setError(null);
    setRecommendSeedIds(ids);
    setRecommendMode(mode);
    fetchRecommendations(ids, mode)
      .then((data) => {
        setBooks(data.books || []);
        setTotal((data.books || []).length);
        setRecommendSeeds(data.seeds || []);
        setRecommendNoCommonGround(Boolean(data.noCommonGround));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleRecommend = useCallback((ids, mode) => runRecommend(ids, mode), [runRecommend]);

  const bodyLocked = useMemo(() => Boolean(selectedId) || sidebarOpen, [selectedId, sidebarOpen]);

  useEffect(() => {
    document.body.style.overflow = bodyLocked ? 'hidden' : '';
  }, [bodyLocked]);

  const hasMore = books.length < total;

  return (
    <div className="app-shell">
      <Header
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        resultCount={total}
        view={view}
        onNavigateHome={goHome}
        onNavigateBrowse={goBrowse}
        onNavigateAbout={goAbout}
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
          {recommendSeedIds.length > 1 && (
            <div className="book-picker-mode recommend-mode-toggle">
              <button
                type="button"
                className={recommendMode === 'any' ? 'active' : ''}
                onClick={() => runRecommend(recommendSeedIds, 'any')}
              >
                Similar to any of these
              </button>
              <button
                type="button"
                className={recommendMode === 'all' ? 'active' : ''}
                onClick={() => runRecommend(recommendSeedIds, 'all')}
              >
                Common to all of these
              </button>
            </div>
          )}
          <BookGrid
            books={books}
            loading={loading}
            onSelect={(id) => setSelectedId(id)}
            filters={null}
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
      />
    </div>
  );
}
