import React from 'react';
import { SPICE_FLAME_COUNT } from '../constants/taxonomy.js';
import '../styles/BookCard.css';

const STATUS_LABEL = {
  standalone: 'Standalone',
  'series-complete': 'Series · Complete',
  'series-ongoing': 'Series · Ongoing',
  'duology-complete': 'Duology · Complete',
  'duology-ongoing': 'Duology · Ongoing',
};

function Flames({ level }) {
  if (!level) return null;
  const count = SPICE_FLAME_COUNT[level] ?? 0;
  if (count === 0) return <span className="flames flames-clean">clean</span>;
  return (
    <span className="flames" title={`Spice: ${level}`}>
      {'\u{1F525}'.repeat(count)}
    </span>
  );
}

export default function BookCard({ book, onSelect }) {
  const tropes = [...(book.romance_tropes || []), ...(book.plot_tropes || [])].slice(0, 3);

  return (
    <button className="book-card" onClick={() => onSelect(book.id)}>
      <div className="book-cover-wrap">
        {book.cover_url ? (
          <img className="book-cover" src={book.cover_url} alt={`Cover of ${book.title}`} loading="lazy" />
        ) : (
          <div className="book-cover book-cover-placeholder">
            <span className="placeholder-title">{book.title}</span>
            <span className="placeholder-author">{book.author}</span>
          </div>
        )}
        {book.series_status && (
          <span className="status-badge">{STATUS_LABEL[book.series_status] || book.series_status}</span>
        )}
        {tropes.length > 0 && (
          <div className="trope-overlay">
            {tropes.map((t) => (
              <span key={t} className="trope-chip">
                {t.replace(/-/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="book-meta">
        <h3 className="book-title">{book.title}</h3>
        <p className="book-author">{book.author}</p>
        <div className="book-stats">
          <Flames level={book.spice_level} />
          {book.overall_score != null && (
            <span className="overall-score">
              <span className="star">&#9733;</span> {book.overall_score.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
