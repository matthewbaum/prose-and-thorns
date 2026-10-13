import { Router } from 'express';
import { getBookById } from '../db/booksRepo.js';
import { logPageView, isBot, VIEWS, KINDS } from '../db/pageViewsRepo.js';

const router = Router();

// Fire-and-forget from the frontend on each section change and book open.
// No auth, no cookies, no IP or user-agent stored: just which part of the
// site was viewed and a random per-session id, so "visits" can be counted.
router.post('/', (req, res) => {
  const { kind, view, bookId, sessionId } = req.body || {};
  if (isBot(req.get('user-agent'))) return res.status(204).end();
  if (!KINDS.includes(kind) || typeof sessionId !== 'string' || !/^[\w-]{8,64}$/.test(sessionId)) {
    return res.status(400).json({ error: 'invalid tracking payload' });
  }
  if (kind === 'view' && !VIEWS.includes(view)) {
    return res.status(400).json({ error: `view must be one of: ${VIEWS.join(', ')}` });
  }
  if (kind === 'book' && !(Number.isInteger(bookId) && getBookById(bookId))) {
    return res.status(400).json({ error: 'unknown book' });
  }
  logPageView({ kind, view: kind === 'view' ? view : null, bookId: kind === 'book' ? bookId : null, sessionId });
  res.status(204).end();
});

export default router;
