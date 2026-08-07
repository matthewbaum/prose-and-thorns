import React, { useState, useEffect } from 'react';
import QualityRadar from './QualityRadar.jsx';
import QualityDimension from './QualityDimension.jsx';
import ProseCraftFlags from './ProseCraftFlags.jsx';
import ScoreMethodologyInfo from './ScoreMethodologyInfo.jsx';
import { QUALITY_DIMENSIONS, SPICE_FLAME_COUNT, CONTENT_WARNINGS, PUBLISHER_TYPE } from '../constants/taxonomy.js';
import '../styles/DetailPanel.css';

const WARNING_LABELS = Object.fromEntries(CONTENT_WARNINGS.map((w) => [w.value, w.label]));
const PUBLISHER_TYPE_LABELS = Object.fromEntries(PUBLISHER_TYPE.map((p) => [p.value, p.label]));

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
  const synopsis = book?.synopsis || book?.description || '';
  const praise = book?.praise || [];
  const truncated = synopsis.length > 420 && !descExpanded;
  const shownSynopsis = truncated ? `${synopsis.slice(0, 420)}…` : synopsis;

  const findLink =
    book?.google_books_link ||
    (book ? `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(`${book.title} ${book.author}`)}` : '#');

  const hasHardcover = book?.hardcover_avg_rating != null;
  const realRating = hasHardcover ? book?.hardcover_avg_rating : book?.avg_rating;
  const realRatingCount = hasHardcover ? book?.hardcover_ratings_count : book?.ratings_count;
  const realRatingSource = hasHardcover ? 'Hardcover' : 'Google Books';

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
                {book.publisher_type && (
                  <p className="detail-publisher-type">{PUBLISHER_TYPE_LABELS[book.publisher_type] || book.publisher_type}</p>
                )}
                {book.page_count != null && (
                  <p className="detail-page-count">
                    {book.page_count} pages &middot; ~{Math.max(1, Math.round(book.page_count / 40))} hr read
                  </p>
                )}
                {seriesLine(book) && <p className="detail-series">{seriesLine(book)}</p>}
                {realRating != null && (
                  <p className="detail-google-rating">
                    <span className="star">&#9733;</span> {realRating.toFixed(1)} on {realRatingSource}
                    {realRatingCount != null && ` (${realRatingCount.toLocaleString()} ratings)`}
                  </p>
                )}
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

            {synopsis && (
              <div className="detail-description">
                <p>{shownSynopsis}</p>
                {synopsis.length > 420 && (
                  <button className="link-btn" onClick={() => setDescExpanded((v) => !v)}>
                    {descExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}

            {praise.length > 0 && (
              <div className="detail-praise">
                <h4 className="detail-praise-heading">Praise</h4>
                <ul>
                  {praise.map((quote, i) => (
                    <li key={i}>&ldquo;{quote.replace(/^["“]|["”]$/g, '')}&rdquo;</li>
                  ))}
                </ul>
              </div>
            )}

            <section className="detail-quality">
              <div className="quality-heading-row">
                <h3 className="section-heading">Quality Profile</h3>
                <ScoreMethodologyInfo label="How these are calculated" />
              </div>
              {quality ? (
                <>
                  {quality.overall_score != null && (
                    <p className="detail-overall-score">
                      AI-derived overall: <strong>{quality.overall_score.toFixed(1)}</strong> / 5
                      <span className="detail-overall-note"> (average of the six dimensions below)</span>
                    </p>
                  )}
                  <ul className="confidence-legend">
                    <li>
                      <span className="confidence-dot confidence-high" /> High — many corroborating
                      reviews
                    </li>
                    <li>
                      <span className="confidence-dot confidence-medium" /> Medium — a moderate or
                      mixed sample
                    </li>
                    <li>
                      <span className="confidence-dot confidence-low" /> Low — under 5 reviews found,
                      rough signal only
                    </li>
                    <li>
                      <span className="confidence-dot confidence-editorial" /> AI editorial — no reader
                      reviews yet, AI-generated estimate
                    </li>
                  </ul>
                  <div className="radar-wrap">
                    <QualityRadar profile={quality} />
                  </div>
                  <div className="quality-dimensions">
                    {QUALITY_DIMENSIONS.map((d) => (
                      <React.Fragment key={d.key}>
                        <QualityDimension label={d.label} data={quality[d.key]} />
                        {d.key === 'prose_quality' && <ProseCraftFlags quality={quality} />}
                      </React.Fragment>
                    ))}
                  </div>
                  <p className="review-source-note">
                    {quality.confidence === 'editorial' ? (
                      <>
                        This quality profile is an AI-generated editorial assessment based on this
                        book&apos;s well-established critical and reader reputation — not synthesized
                        from specific review text. It will be replaced with real reader-review
                        synthesis once that data source is available.
                      </>
                    ) : (
                      <>
                        Quality profile synthesized from {quality.review_count_used ?? 0} real reader
                        reviews (Hardcover and review blogs), weighed against the book&apos;s aggregate
                        rating shown above.
                        {quality.confidence === 'low' && (
                          <> Limited review volume — treat these scores as a rough signal, not a verdict.</>
                        )}
                      </>
                    )}
                  </p>
                  {book.hardcover_url && (
                    <a
                      className="hardcover-reviews-link"
                      href={book.hardcover_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Read the actual reviews on Hardcover &rarr;
                    </a>
                  )}
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
