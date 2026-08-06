import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Header from './components/Header.jsx';
import FilterPanel from './components/FilterPanel.jsx';
import BookGrid from './components/BookGrid.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import { fetchBooks, fetchBook } from './api.js';
import './styles/App.css';

const DEFAULT_FILTERS = {
  series_status: 'any',
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
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedBook, setSelectedBook] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBooks(filters)
      .then((data) => {
        if (!cancelled) setBooks(data.books || []);
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
  }, [filters]);

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

  const resultCount = books.length;

  const bodyLocked = useMemo(() => Boolean(selectedId) || sidebarOpen, [selectedId, sidebarOpen]);

  useEffect(() => {
    document.body.style.overflow = bodyLocked ? 'hidden' : '';
  }, [bodyLocked]);

  return (
    <div className="app-shell">
      <Header
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        resultCount={resultCount}
      />
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
          />
        </main>
      </div>
      <DetailPanel
        book={selectedBook}
        loading={detailLoading}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
