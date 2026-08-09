import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import '../styles/RatingLegend.css';

export default function RatingLegend() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="rating-legend" onClick={() => setOpen(true)}>
        <span className="rating-legend-item">
          <span className="star filled">&#9733;</span> real reader rating
        </span>
        <span className="rating-legend-item">
          <span className="star outline">&#9734;</span> Quality Profile score
        </span>
      </button>

      {open &&
        createPortal(
          <div className="methodology-scrim" onClick={() => setOpen(false)}>
            <div
              className="methodology-modal"
              role="dialog"
              aria-modal="true"
              aria-label="What the star ratings mean"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="methodology-close" onClick={() => setOpen(false)} aria-label="Close">
                &times;
              </button>
              <h2>Two different star ratings</h2>

              <h3 className="real-rating-heading">
                <span className="star filled">&#9733;</span> Real reader rating
              </h3>
              <p>
                A plain aggregate rating from Hardcover (or Google Books when Hardcover has no
                match) — thousands of individual readers&apos; own star ratings, averaged. This is
                not synthesized or AI-generated; it&apos;s the same kind of number you&apos;d see on
                any book platform.
              </p>

              <h3>
                <span className="star outline">&#9734;</span> Quality Profile score
              </h3>
              <p>
                This app&apos;s own score — an average of six dimensions (prose, romance,
                world-building, pacing, emotional payoff, character depth), each synthesized by AI
                from real review text and reconciled against the aggregate rating above. It exists
                to break a single star rating into the specific things that make a book good or
                not, for the type of book you&apos;re looking for.
              </p>

              <p className="methodology-disclaimer">
                Open any book for the full breakdown, including how confident each dimension score
                is.
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
