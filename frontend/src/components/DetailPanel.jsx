import React, { useState, useEffect } from 'react';
import QualityRadar from './QualityRadar.jsx';
import QualityDimension from './QualityDimension.jsx';
import ScoreMethodologyInfo from './ScoreMethodologyInfo.jsx';
import { QUALITY_DIMENSIONS, SPICE_FLAME_COUNT, CONTENT_WARNINGS } from '../constants/taxonomy.js';
import '../styles/DetailPanel.css';

const WARNING_LABELS = Object.fromEntries(CONTENT_WARNINGS.map((w) => [w.value, w.label]));

function seriesLine(book) {
  if (!book.series_name) return null;
  const parts = [];
  if (book.series_position && book.series_total) {
    parts.push(`Book ${book.series_position} of ${book.series_total}`);
  } else if (book.series_total) {
    parts.push(`${book.series_total} books`);
  }
  if (book.series_complete === true) parts.push('complete');
  if (book.series_complete === false) parts.push('ongoing');
  if (book.next_release_date) parts.push(`next: ${book.next_release_date}`);
  return `${book.series_name}${parts.length ? ` — ${parts.join(', ')}` : ''}`;
}

export default function DetailPanel({ book, loading, onClose }) {
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    setDescExpanded(false);
  }, [book?.id]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    if (book) {
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [book, onClose]);

  const open = Boolean(book) || loading;
  if (!open) return null;

  const quality = book?.quality_profile;
  const description = book?.description || '';
  const truncated = description.length > 420 && !descExpanded;
  const shownDescription = truncated ? `${description.slice(0, 420)}…` : description;

  const findLink =
    book?.google_books_link ||
    (book ? `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(`${book.title} ${book.author}`)}` : '#');

  return (
    <>
      <div className="detail-scrim" onClick={onClose} />
      <aside className="detail-panel" role="dialog" aria-modal="true">
        <button className="detail-close" onClick={onClose} aria-label="Close">
          &times;
        </button>

        {loading && !book && <div className="detail-loading">Loading…</div>}

        {book && (
          <div className="detail-content">
            <div className="detail-header">
              <div className="detail-cover-wrap">
                {book.cover_url ? (
                  <img src={book.cover_url} alt={`Cover of ${book.title}`} className="detail-cover" />
                ) : (
                  <div className="detail-cover detail-cover-placeholder">
                    <span>{book.title}</span>
                  </div>
                )}
              </div>
              <div className="detail-header-text">
                <h2 className="detail-title">{book.title}</h2>
                <p className="detail-author">{book.author}</p>
                {book.publisher && <p className="detail-publisher">{book.publisher}</p>}
                {seriesLine(book) && <p className="detail-series">{seriesLine(book)}</p>}
              </div>
            </div>

            <div className="detail-tags">
              {book.subgenre && <span className="tag tag-subgenre">{book.subgenre.replace(/-/g, ' ')}</span>}
              {book.spice_level && (
                <span className="tag tag-spice">
                  {'\u{1F525}'.repeat(SPICE_FLAME_COUNT[book.spice_level] ?? 0) || 'clean'}
                </span>
              )}
              {book.lgbtq === 'yes' && <span className="tag tag-lgbtq">LGBTQ+</span>}
              {[...(book.romance_tropes || []), ...(book.plot_tropes || [])]
                .slice(0, 4)
                .map((t) => (
                  <span key={t} className="tag tag-trope">
                    {t.replace(/-/g, ' ')}
                  </span>
                ))}
            </div>

            {description && (
              <div className="detail-description">
                <p>{shownDescription}</p>
                {description.length > 420 && (
                  <button className="link-btn" onClick={() => setDescExpanded((v) => !v)}>
                    {descExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}

            <section className="detail-quality">
              <div className="quality-heading-row">
                <h3 className="section-heading">Quality Profile</h3>
                <ScoreMethodologyInfo label="How these are calculated" />
              </div>
              {quality ? (
                <>
                  <div className="radar-wrap">
                    <QualityRadar profile={quality} />
                  </div>
                  <div className="quality-dimensions">
                    {QUALITY_DIMENSIONS.map((d) => (
                      <QualityDimension key={d.key} label={d.label} data={quality[d.key]} />
                    ))}
                  </div>
                  <p className="review-source-note">
                    Quality profile synthesized from {quality.review_count_used ?? 0} reader reviews on
                    Reddit (r/Romantasy, r/RomanceBooks, r/Fantasy) and Google Books.
                    {quality.confidence === 'low' && (
                      <> Limited review volume — treat these scores as a rough signal, not a verdict.</>
                    )}
                  </p>
                </>
              ) : (
                <p className="quality-missing">
                  No quality profile yet — this book hasn&apos;t been through review synthesis.
                </p>
              )}
            </section>

            {book.content_warnings && book.content_warnings.length > 0 && (
              <section className="detail-warnings">
                <h3 className="section-heading">Content Warnings</h3>
                <ul>
                  {book.content_warnings.map((w) => (
                    <li key={w}>{WARNING_LABELS[w] || w.replace(/-/g, ' ')}</li>
                  ))}
                </ul>
              </section>
            )}

            <a className="find-book-btn" href={findLink} target="_blank" rel="noreferrer">
              Find this book
            </a>
          </div>
        )}
      </aside>
    </>
  );
}
