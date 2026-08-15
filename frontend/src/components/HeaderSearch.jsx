import React, { useEffect, useRef, useState } from 'react';
import { searchBooks } from '../api.js';
import '../styles/HeaderSearch.css';

export default function HeaderSearch({ onSelectBook }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

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

  const close = () => {
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  // Opening moves focus into the input, so a reader who clicked the icon
  // can start typing immediately rather than needing a second click.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Outside-click and Escape both close it — the icon toggling it back
  // open is a small enough target that "click away to dismiss" needs to
  // just work, same expectation as any site search flyout.
  useEffect(() => {
    if (!open) return;
    const handlePointer = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const pick = (book) => {
    onSelectBook(book.id);
    close();
  };

  return (
    <div className="header-search" ref={wrapRef}>
      {open ? (
        <div className="header-search-input-wrap">
          <input
            ref={inputRef}
            type="text"
            className="header-search-input"
            placeholder="Look up a book…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim().length >= 2 && (
            <div className="header-search-results">
              {searching && <div className="header-search-result-empty">Searching&hellip;</div>}
              {!searching && results.length === 0 && (
                <div className="header-search-result-empty">No matches</div>
              )}
              {!searching &&
                results.map((book) => (
                  <button key={book.id} type="button" className="header-search-result" onClick={() => pick(book)}>
                    <span className="header-search-result-title">{book.title}</span>
                    <span className="header-search-result-author">{book.author}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="header-search-toggle"
          onClick={() => setOpen(true)}
          aria-label="Look up a book"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <line x1="13.2" y1="13.2" x2="18" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
