import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { submitInquiry } from '../api.js';
import { QUALITY_DIMENSIONS } from '../constants/taxonomy.js';
import '../styles/SubmissionModal.css';

// Coarse triage buckets, not an exhaustive taxonomy — 'other' covers
// anything that doesn't fit so a reader is never blocked from reporting
// something real just because it doesn't match a category.
export const CORRECTION_CATEGORIES = [
  { value: 'wrong-cover', label: 'Wrong cover image' },
  { value: 'wrong-quality-score', label: 'Quality score / review seems off' },
  { value: 'wrong-series-info', label: 'Wrong series info (order, count, etc.)' },
  { value: 'wrong-author', label: 'Wrong author or edition' },
  { value: 'other', label: 'Something else' },
];

const COPY = {
  contact: {
    title: 'Get in touch',
    messageLabel: 'Message',
    messagePlaceholder: "What's on your mind?",
    submitLabel: 'Send message',
  },
  review: {
    title: 'Submit a review',
    messageLabel: 'Your review',
    messagePlaceholder: 'What did you think of the writing, the romance, the pacing...?',
    submitLabel: 'Submit review',
  },
  partnership: {
    title: 'Partner with us',
    description:
      "Prose & Thorns is built around a simple idea: readers deserve to know not just what a book is about, but whether it's actually worth their time. We're looking to connect with BookTok, Bookstagram, and BookTube creators, as well as book bloggers and podcasters, who care about reading quality as much as tropes — to hear your ideas, get your feedback, and explore what working together might look like.\n\nIf that sounds interesting, we'd love to hear from you.",
    messageLabel: 'Tell us about your audience',
    messagePlaceholder: 'Who do you reach, and what did you have in mind?',
    submitLabel: 'Send inquiry',
  },
  correction: {
    title: 'Report an error',
    messageLabel: 'What did you notice?',
    messagePlaceholder: 'The more specific, the faster we can fix it.',
    submitLabel: 'Send report',
  },
};

// initialBookTitle/initialBookId: set when opened from a specific book's
// detail panel — the title is then fixed (not re-typed) since the context
// is unambiguous. 'correction' needs the real book_id (not just title text)
// so a report resolves back to an exact catalog row.
export default function SubmissionModal({ type, onClose, initialBookTitle, initialBookId }) {
  const copy = COPY[type];
  const bookTitleLocked = Boolean(initialBookTitle);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [bookTitle, setBookTitle] = useState(initialBookTitle || '');
  // The reviewer's own holistic star rating — a genuinely separate signal
  // from the six dimension scores below, the same role this app's own ★
  // "real reader rating" plays against its ☆ synthesized Quality Profile
  // score. Not an average of the six; a reader's overall feeling about a
  // book can diverge from its craft breakdown.
  const [rating, setRating] = useState('');
  // One score per dimension this app itself scores everything by.
  const [dimensionScores, setDimensionScores] = useState({});
  const [channelUrl, setChannelUrl] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const allDimensionsScored =
    type !== 'review' || QUALITY_DIMENSIONS.every((d) => dimensionScores[d.key]);

  const canSubmit =
    name.trim() &&
    email.trim() &&
    message.trim() &&
    (type !== 'review' || (bookTitle.trim() && rating)) &&
    (type !== 'correction' || category) &&
    allDimensionsScored;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const dimensionPayload = {};
    if (type === 'review') {
      for (const d of QUALITY_DIMENSIONS) {
        dimensionPayload[d.key] = Number(dimensionScores[d.key]);
      }
    }
    submitInquiry({
      type,
      name: name.trim(),
      email: email.trim(),
      message: message.trim(),
      book_title: type === 'review' || type === 'correction' ? bookTitle.trim() : undefined,
      book_id: type === 'correction' ? initialBookId : undefined,
      category: type === 'correction' ? category : undefined,
      rating: type === 'review' ? Number(rating) : undefined,
      ...dimensionPayload,
      channel_url: type === 'partnership' ? channelUrl.trim() || undefined : undefined,
    })
      .then(() => setDone(true))
      .catch((err) => setError(err.message))
      .finally(() => setSubmitting(false));
  };

  const title = bookTitleLocked
    ? type === 'correction'
      ? `Report an error: "${initialBookTitle}"`
      : `Review "${initialBookTitle}"`
    : copy.title;

  return createPortal(
    <div className="submission-scrim" onClick={onClose}>
      <div
        className="submission-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="submission-close" onClick={onClose} aria-label="Close">
          &times;
        </button>

        {done ? (
          <div className="submission-done">
            <h2>Thanks!</h2>
            <p>
              {type === 'contact' && "We've got your message and will get back to you soon."}
              {type === 'review' && "Your review has been submitted for review before it's posted."}
              {type === 'partnership' && "We'll take a look and follow up if it's a fit."}
              {type === 'correction' && "Thanks for the catch — we'll look into it."}
            </p>
            <button type="button" className="submission-submit" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2>{title}</h2>

            {copy.description && (
              <p className="submission-description">
                {copy.description.split('\n\n').map((para, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && (
                      <>
                        <br />
                        <br />
                      </>
                    )}
                    {para}
                  </React.Fragment>
                ))}
              </p>
            )}

            <label className="submission-field">
              Name
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>

            <label className="submission-field">
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>

            {type === 'review' && (
              <>
                {!bookTitleLocked && (
                  <label className="submission-field">
                    Book title
                    <input
                      type="text"
                      value={bookTitle}
                      onChange={(e) => setBookTitle(e.target.value)}
                      required
                    />
                  </label>
                )}

                <label className="submission-field">
                  Your overall rating
                  <select value={rating} onChange={(e) => setRating(e.target.value)} required>
                    <option value="" disabled>
                      Select
                    </option>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} star{n === 1 ? '' : 's'}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="submission-dimensions-label">
                  Now rate each dimension individually — same six we score every book by:
                </p>
                <div className="submission-dimension-grid">
                  {QUALITY_DIMENSIONS.map((d) => (
                    <label key={d.key} className="submission-dimension-field">
                      {d.label}
                      <select
                        value={dimensionScores[d.key] || ''}
                        onChange={(e) =>
                          setDimensionScores((prev) => ({ ...prev, [d.key]: e.target.value }))
                        }
                        required
                      >
                        <option value="" disabled>
                          Select
                        </option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </>
            )}

            {type === 'correction' && (
              <label className="submission-field">
                What's wrong?
                <select value={category} onChange={(e) => setCategory(e.target.value)} required>
                  <option value="" disabled>
                    Select
                  </option>
                  {CORRECTION_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {type === 'partnership' && (
              <label className="submission-field">
                Your site / channel URL (optional)
                <input
                  type="text"
                  value={channelUrl}
                  onChange={(e) => setChannelUrl(e.target.value)}
                  placeholder="https://..."
                />
              </label>
            )}

            <label className="submission-field">
              {copy.messageLabel}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={copy.messagePlaceholder}
                rows={5}
                required
              />
            </label>

            {error && <p className="submission-error">{error}</p>}

            <button type="submit" className="submission-submit" disabled={!canSubmit || submitting}>
              {submitting ? 'Sending…' : copy.submitLabel}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
