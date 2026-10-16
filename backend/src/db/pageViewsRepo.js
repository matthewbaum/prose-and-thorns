import liveDb, { LIVE_DB_PATH } from './liveDb.js';

export const VIEWS = ['home', 'browse', 'recommend', 'about'];
export const KINDS = ['view', 'book'];

// Crawlers and uptime monitors would otherwise dominate the numbers on a
// site this small.
const BOT_RE = /bot|crawl|spider|slurp|headless|preview|monitor|curl|wget|python-requests|facebookexternalhit/i;
export const isBot = (userAgent) => !userAgent || BOT_RE.test(userAgent);

const insertView = liveDb.prepare(
  'INSERT INTO page_views (kind, view, book_id, session_id) VALUES (?, ?, ?, ?)'
);

export function logPageView({ kind, view, bookId, sessionId }) {
  insertView.run(kind, view ?? null, bookId ?? null, sessionId);
}

const one = (sql, ...args) => liveDb.prepare(sql).get(...args);

// Newest-first raw rows for the admin "Recent visits" list. Session ids are
// shortened: enough to see which rows belong to one browser session, not to
// identify anyone.
export function getRecentViews(limit = 30) {
  return liveDb
    .prepare('SELECT kind, view, book_id, session_id, viewed_at FROM page_views ORDER BY id DESC LIMIT ?')
    .all(limit)
    .map((r) => ({ ...r, session: r.session_id.slice(0, 6) }));
}

export function getTrafficSummary() {
  const windows = [
    ['Today', "date(viewed_at) = date('now')"],
    ['Last 7 days', "viewed_at >= datetime('now', '-7 days')"],
    ['Last 30 days', "viewed_at >= datetime('now', '-30 days')"],
    ['All time', '1=1'],
  ];
  const totals = windows.map(([label, where]) => ({
    label,
    ...one(
      `SELECT COUNT(DISTINCT session_id) AS visits,
              COALESCE(SUM(kind = 'view'), 0) AS pageViews,
              COALESCE(SUM(kind = 'book'), 0) AS bookViews
       FROM page_views WHERE ${where}`
    ),
  }));

  return {
    totals,
    since: one('SELECT MIN(viewed_at) AS t FROM page_views').t,
    byDay: liveDb
      .prepare(
        `SELECT date(viewed_at) AS day, COUNT(DISTINCT session_id) AS visits, COALESCE(SUM(kind = 'view'), 0) AS views
         FROM page_views WHERE viewed_at >= datetime('now', '-14 days')
         GROUP BY day ORDER BY day DESC`
      )
      .all(),
    bySection: liveDb
      .prepare(
        `SELECT view, COUNT(*) AS views FROM page_views WHERE kind = 'view'
         GROUP BY view ORDER BY views DESC`
      )
      .all(),
    // Book titles live in the catalog database, so the caller resolves them.
    topBooks: liveDb
      .prepare(
        `SELECT book_id, COUNT(*) AS views, COUNT(DISTINCT session_id) AS visitors
         FROM page_views WHERE kind = 'book'
         GROUP BY book_id ORDER BY views DESC LIMIT 10`
      )
      .all(),
    dbPath: LIVE_DB_PATH,
  };
}
