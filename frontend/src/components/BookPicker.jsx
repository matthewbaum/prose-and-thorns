import React, { useEffect, useRef, useState } from 'react';
import { searchBooks } from '../api.js';
import '../styles/BookPicker.css';

const MAX_SEEDS = 5;

export default function BookPicker({ onRecommend, initialSelected, initialMode, submitLabel }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(initialSelected || []);
  const [mode, setMode] = useState(initialMode || 'any');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      searchBooks(query.trim())
        .then((data) => setResults(data.books || []))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const addBook = (book) => {
    if (selected.some((b) => b.id === book.id) || selected.length >= MAX_SEEDS) return;
    setSelected((prev) => [...prev, book]);
    setQuery('');
    setResults([]);
  };

  const removeBook = (id) => {
    setSelected((prev) => prev.filter((b) => b.id !== id));
  };

  const selectedIds = new Set(selected.map((b) => b.id));
  const visibleResults = results.filter((b) => !selectedIds.has(b.id));

  return (
    <div className="book-picker">
      <div className="book-picker-input-wrap">
        <input
          type="text"
          className="book-picker-input"
          placeholder="Search for a book you like…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={selected.length >= MAX_SEEDS}
        />
        {query.trim().length >= 2 && (
          <div className="book-picker-results">
            {searching && <div className="book-picker-result-empty">Searching&hellip;</div>}
            {!searching && visibleResults.length === 0 && (
              <div className="book-picker-result-empty">No matches</div>
            )}
            {!searching &&
              visibleResults.map((book) => (
                <button key={book.id} type="button" className="book-picker-result" onClick={() => addBook(book)}>
                  <span className="book-picker-result-title">{book.title}</span>
                  <span className="book-picker-result-author">{book.author}</span>
                </button>
              ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="book-picker-chips">
          {selected.map((book) => (
            <span key={book.id} className="book-picker-chip">
              {book.title}
              <button type="button" onClick={() => removeBook(book.id)} aria-label={`Remove ${book.title}`}>
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {selected.length > 1 && (
        <div className="book-picker-mode" role="radiogroup" aria-label="Recommendation mode">
          <button
            type="button"
            className={mode === 'any' ? 'active' : ''}
            onClick={() => setMode('any')}
            aria-pressed={mode === 'any'}
          >
            Similar to any of these
          </button>
          <button
            type="button"
            className={mode === 'all' ? 'active' : ''}
            onClick={() => setMode('all')}
            aria-pressed={mode === 'all'}
          >
            Common to all of these
          </button>
        </div>
      )}

      <button
        type="button"
        className="book-picker-submit"
        disabled={selected.length === 0}
        onClick={() => onRecommend(selected.map((b) => b.id), mode)}
      >
        {submitLabel || 'Get recommendations'}
      </button>
      {selected.length >= MAX_SEEDS && (
        <p className="book-picker-max-note">Max {MAX_SEEDS} books — remove one to add another.</p>
      )}
    </div>
  );
}
