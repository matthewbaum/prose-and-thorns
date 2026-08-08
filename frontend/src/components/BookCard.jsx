import React from 'react';
import { SPICE_FLAME_COUNT } from '../constants/taxonomy.js';
import { getMatchedFilters } from '../lib/matchedFilters.js';
import { tropeLabel } from '../lib/labels.js';
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

export default function BookCard({ book, onSelect, filters }) {
  const allTropes = [...(book.romance_tropes || []), ...(book.plot_tropes || [])];
  const matched = filters ? getMatchedFilters(book, filters) : book.match_reasons || [];
  const matchedKeys = new Set(matched.map((m) => m.key.replace(/^trope-/, '')));
  // The hover overlay shows other tropes for general discovery — no need to
  // repeat ones already pinned in the always-visible matched-filters row above.
  const tropes = allTropes.filter((t) => !matchedKeys.has(t)).slice(0, 3);

  // Hardcover has far more coverage than Google Books (thousands of ratings
  // vs. often single digits) — prefer it whenever both are available.
  const hasHardcover = book.hardcover_avg_rating != null;
  const realRating = hasHardcover ? book.hardcover_avg_rating : book.avg_rating;
  const realRatingCount = hasHardcover ? book.hardcover_ratings_count : book.ratings_count;
  const realRatingSource = hasHardcover ? 'Hardcover' : 'Google Books';

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
                {tropeLabel(t)}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="book-meta">
        <h3 className="book-title">{book.title}</h3>
        <p className="book-author">{book.author}</p>
        {matched.length > 0 && (
          <div className="matched-filters">
            {matched.map((m) => (
              <span key={m.key} className="matched-filter-chip">
                {m.label}
              </span>
            ))}
          </div>
        )}
        <div className="book-stats">
          <Flames level={book.spice_level} />
          <div className="book-scores">
            {realRating != null && (
              <span className="google-rating" title={`${realRatingCount ?? 0} ratings on ${realRatingSource}`}>
                <span className="star">&#9733;</span> {realRating.toFixed(1)}
              </span>
            )}
            {book.overall_score != null && (
              <span className="overall-score" title="Quality Profile score — average of the six synthesized dimensions below">
                <span className="star">&#9734;</span> {book.overall_score.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
