import React, { useEffect, useState } from 'react';
import Shelf from './Shelf.jsx';
import RatingLegend from './RatingLegend.jsx';
import QuickSearch from './QuickSearch.jsx';
import BookPicker from './BookPicker.jsx';
import { fetchShelves, fetchBookCount } from '../api.js';
import '../styles/HomePage.css';

export default function HomePage({ onSelectBook, onBrowseAll, onQuickSearch, onRecommend }) {
  const [shelves, setShelves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookCount, setBookCount] = useState(null);

  // Live from the database on every visit, so it tracks the catalog as books
  // are added. A failed fetch just leaves the line out -- it's decoration, not
  // something worth an error state.
  useEffect(() => {
    let cancelled = false;
    fetchBookCount()
      .then((data) => {
        if (!cancelled && Number.isFinite(data?.count)) setBookCount(data.count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchShelves()
      .then((data) => {
        if (!cancelled) setShelves(data.shelves || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // An angled cluster of the top-quality covers gives the hero real visual
  // weight instead of a wall of text/inputs — reuses the same "Highest
  // quality scores" shelf that's also rendered in full further down (not a
  // separate fetch), since a book worth putting in the cluster is also
  // worth being in that shelf. Eight, not four — more real catalog variety
  // rather than blowing up the same handful of covers. (Was six; widened
  // to eight alongside the hero's wider art column — see HomePage.css.)
  // Only books with real cover art -- a title card doesn't belong in the cover cluster.
  // Open Library covers redirect through archive.org and take 2-3s to appear, so the
  // above-the-fold cluster prefers faster hosts (they still show everywhere else).
  const heroCovers = (shelves[0]?.books || [])
    .filter((b) => b.cover_url && !b.cover_url.includes('openlibrary.org'))
    .slice(0, 8);

  return (
    <div className="home-page">
      <div className="home-hero">
        <div className="home-hero-atmosphere" aria-hidden="true" />
        <img className="home-hero-rose-watermark" src="/rose-logo.svg" alt="" aria-hidden="true" />
        <div className="home-hero-copy">
          <p className="home-hero-eyebrow">Six dimensions scored &middot; real reader reviews</p>
          <h1 className="home-hero-title">
            Not just what a book is about.
            <br />
            But whether it&apos;s <em>actually good.</em>
          </h1>
          <p className="home-hero-text">
            Trope lists tell you what happens. We tell you if the writing holds up — scored from
            real reviews, not hype.
          </p>
          <button className="browse-all-btn" onClick={onBrowseAll}>
            Browse all books
          </button>
          {bookCount != null && (
            <p className="home-book-count">
              <span className="home-book-count-number">{bookCount.toLocaleString()}</span>{' '}
              {bookCount === 1 ? 'book' : 'books'} and growing
            </p>
          )}
        </div>

        {heroCovers.length > 0 && (
          <div className="home-hero-covers">
            {heroCovers.map((book, i) => (
              <button
                key={book.id}
                type="button"
                className={`home-hero-cover c${i + 1}`}
                onClick={() => onSelectBook(book.id)}
              >
                <img src={book.cover_url} alt={book.title} />
                {book.overall_score != null && (
                  <span className="home-hero-cover-badge">☆ {book.overall_score.toFixed(1)}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="home-primary-card">
        <p className="quick-search-label">
          Tell us a few books you already love — we&apos;ll find similar ones, and you can filter
          them by quality once you see the matches:
        </p>
        <BookPicker onRecommend={onRecommend} />
      </div>

      <QuickSearch onSearch={onQuickSearch} />

      {loading ? (
        <p className="home-loading">Loading shelves&hellip;</p>
      ) : (
        <>
          {shelves.length > 0 && <RatingLegend />}
          {shelves.map((shelf) => (
            <Shelf key={shelf.key} title={shelf.title} books={shelf.books} onSelect={onSelectBook} />
          ))}
        </>
      )}
    </div>
  );
}
