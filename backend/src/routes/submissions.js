import { Router } from 'express';
import { createSubmission } from '../db/submissionsRepo.js';
import { QUALITY_DIMENSIONS } from '../constants.js';

const router = Router();

const VALID_TYPES = ['contact', 'review', 'partnership'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Generous but not unbounded — this is a contact form, not a document
// upload; caps protect the DB from a pathological or scripted submission.
const MAX_LEN = { name: 200, email: 254, message: 5000, book_title: 300, channel_url: 500 };

function trimmedString(value, maxLen) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

router.post('/', (req, res) => {
  const body = req.body || {};
  const type = VALID_TYPES.includes(body.type) ? body.type : null;
  const name = trimmedString(body.name, MAX_LEN.name);
  const email = trimmedString(body.email, MAX_LEN.email);
  const message = trimmedString(body.message, MAX_LEN.message);

  if (!type) {
    res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    return;
  }
  if (!name || !email || !message) {
    res.status(400).json({ error: 'name, email, and message are required' });
    return;
  }
  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: 'email is not a valid address' });
    return;
  }

  const bookTitle = type === 'review' ? trimmedString(body.book_title, MAX_LEN.book_title) : null;
  if (type === 'review' && !bookTitle) {
    res.status(400).json({ error: 'book_title is required for review submissions' });
    return;
  }

  // A reviewer rates the same six dimensions this app scores everything by
  // — required together for a review, not optional, since a single generic
  // star would be inconsistent with what the rest of the app measures.
  // Everything else about the book (subgenre, tropes, spice level) comes
  // from our own catalog data, not the reviewer.
  const dimensionScores = {};
  if (type === 'review') {
    for (const dim of QUALITY_DIMENSIONS) {
      const value = body[dim];
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        res.status(400).json({ error: `${dim} must be an integer 1-5` });
        return;
      }
      dimensionScores[dim] = value;
    }
  }
  // A genuinely separate signal from the six craft dimensions — the
  // reviewer's own holistic star rating, the same role this app's ★ "real
  // reader rating" plays against its ☆ synthesized Quality Profile score.
  // Not derived from the six dimensions (a reader can love a book overall
  // for reasons the craft breakdown doesn't fully capture), so it's its
  // own required input rather than a computed average.
  const rating =
    type === 'review' && Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5
      ? body.rating
      : null;
  if (type === 'review' && rating === null) {
    res.status(400).json({ error: 'rating must be an integer 1-5' });
    return;
  }

  const channelUrl = type === 'partnership' ? trimmedString(body.channel_url, MAX_LEN.channel_url) : null;

  const id = createSubmission({
    type,
    name,
    email,
    message,
    book_title: bookTitle,
    rating,
    ...dimensionScores,
    channel_url: channelUrl,
  });

  res.status(201).json({ id });
});

export default router;
