import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// No user-account system exists anywhere in this app — this is the one
// endpoint that returns reader PII (name/email from correction reports),
// so it's gated the same way seed.js already gates pipeline triggers:
// shared ADMIN_PASSWORD, fails closed if unset rather than serving the
// endpoint unprotected.
function checkPassword(req, res) {
  const provided = req.query?.password || req.headers['x-admin-password'];
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    res.status(500).json({ error: 'ADMIN_PASSWORD is not configured on the server' });
    return false;
  }
  if (provided !== expected) {
    res.status(401).send('Invalid admin password');
    return false;
  }
  return true;
}

// Dispositions live in a separate table that survives audit_findings being
// wiped and rebuilt every run (see auditCatalog.js) — a category reviewed
// once as "not a bug" needs to stay reviewed, not get silently reset to
// unreviewed on the next `npm run seed`. A finding's disposition prefers a
// specific-book override over the category-wide default, and falls back
// to 'needs-fix' when nothing has ever reviewed it.
// Verified case: #304/#305/#308 were correctly flagged as author-mismatch
// months ago, then a past review pass marked them "accepted" with the
// reasoning "already hidden by the zero-substance filter, so no wrong info
// is visible to readers" — true on the homepage, but the garbage row was
// still live at a direct URL, and "hidden" isn't "fixed." A wrong-book-
// identity finding is never a matter of taste the way e.g.
// thin-romance-content is, so these categories are excluded from the
// disposition override entirely — no note, however reasonable it sounds,
// can make one of these stop showing up as needing attention. The only way
// off this list is fixing (or removing) the underlying row, which deletes
// the finding itself on the next audit run.
const NEVER_DISMISSIBLE_CATEGORIES = ['author-mismatch', 'title-mismatch', 'wrong-product-title', 'duplicate-title', 'unverified-hardcover-match', 'seed-not-verified'];

function loadFindings() {
  const auditFindings = db
    .prepare(
      `SELECT af.id, 'audit' as source, af.severity, af.category, af.message, af.book_id, af.status,
         af.run_at as created_at,
         CASE WHEN af.category IN (${NEVER_DISMISSIBLE_CATEGORIES.map(() => '?').join(',')})
           THEN 'needs-fix'
           ELSE COALESCE(specific.disposition, general.disposition, 'needs-fix')
         END as disposition,
         COALESCE(specific.note, general.note) as disposition_note
       FROM audit_findings af
       LEFT JOIN finding_dispositions specific
         ON specific.category = af.category AND specific.book_id = af.book_id
       LEFT JOIN finding_dispositions general
         ON general.category = af.category AND general.book_id IS NULL
       WHERE af.status = 'open'
       ORDER BY CASE af.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, af.run_at DESC`
    )
    .all(...NEVER_DISMISSIBLE_CATEGORIES);

  const reports = db
    .prepare(
      `SELECT id, 'reader-report' as source, category, message, book_id, book_title, name, email, status, created_at
       FROM submissions WHERE type = 'correction' AND status = 'new' ORDER BY created_at DESC`
    )
    .all();

  // contact/review/partnership all land in the same submissions table but
  // were never surfaced anywhere before this — they'd silently sit in the
  // DB with zero visibility short of querying it directly.
  const messages = db
    .prepare(
      `SELECT id, type, name, email, message, book_title, rating, channel_url, status, created_at
       FROM submissions WHERE type IN ('contact', 'review', 'partnership') AND status = 'new'
       ORDER BY created_at DESC`
    )
    .all();

  return { auditFindings, reports, messages };
}

router.get('/findings', (req, res) => {
  if (!checkPassword(req, res)) return;
  res.json(loadFindings());
});

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SEVERITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
const TYPE_LABEL = { contact: 'Contact', review: 'Review', partnership: 'Partnership' };

function findingRow(f) {
  return `
    <tr>
      <td><span class="badge badge-${f.severity}">${SEVERITY_LABEL[f.severity]}</span></td>
      <td>${escapeHtml(f.category)}</td>
      <td>${f.book_id ? `#${f.book_id}` : '—'}</td>
      <td>${escapeHtml(f.message)}</td>
    </tr>`;
}

// Raw JSON at /findings only renders readably in browsers with a built-in
// JSON viewer (Chrome/Firefox) — Safari just dumps it as an unformatted
// wall of text. This is the same data, rendered as an actual page, so
// "check the admin findings" doesn't require a specific browser.
router.get('/dashboard', (req, res) => {
  if (!checkPassword(req, res)) return;
  const { auditFindings, reports, messages } = loadFindings();
  const password = escapeHtml(req.query.password || '');

  const needsFix = auditFindings.filter((f) => f.disposition === 'needs-fix');
  const accepted = auditFindings.filter((f) => f.disposition === 'accepted');

  const reportRows = reports
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(r.created_at)}</td>
      <td>${escapeHtml(r.category)}</td>
      <td>${r.book_id ? `#${r.book_id} ${escapeHtml(r.book_title)}` : '—'}</td>
      <td>${escapeHtml(r.message)}</td>
      <td>${escapeHtml(r.name)} &lt;${escapeHtml(r.email)}&gt;</td>
    </tr>`
    )
    .join('');

  const messageRows = messages
    .map(
      (m) => `
    <tr>
      <td>${escapeHtml(m.created_at)}</td>
      <td><span class="badge badge-type">${TYPE_LABEL[m.type] || m.type}</span></td>
      <td>${escapeHtml(m.name)}<br><span class="muted">${escapeHtml(m.email)}</span></td>
      <td>${
        m.type === 'review'
          ? `${escapeHtml(m.book_title)}${m.rating ? ` — ${m.rating}/5` : ''}`
          : m.type === 'partnership' && m.channel_url
            ? escapeHtml(m.channel_url)
            : '—'
      }</td>
      <td style="white-space:pre-wrap;">${escapeHtml(m.message)}</td>
    </tr>`
    )
    .join('');

  const needsFixRows = needsFix.map(findingRow).join('');

  // Accepted findings are grouped by category with the review note shown
  // once per group, not repeated per row — the point of this section is
  // "here's what we already decided and why," a record, not a worklist.
  const acceptedByCategory = new Map();
  for (const f of accepted) {
    if (!acceptedByCategory.has(f.category)) acceptedByCategory.set(f.category, { note: f.disposition_note, items: [] });
    acceptedByCategory.get(f.category).items.push(f);
  }
  const acceptedGroups = [...acceptedByCategory.entries()]
    .map(
      ([category, { note, items }]) => `
    <details>
      <summary>${escapeHtml(category)} (${items.length})${note ? ` — <span class="note">${escapeHtml(note)}</span>` : ''}</summary>
      <table>
        <thead><tr><th>Severity</th><th>Category</th><th>Book</th><th>Message</th></tr></thead>
        <tbody>${items.map(findingRow).join('')}</tbody>
      </table>
    </details>`
    )
    .join('');

  res.send(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Prose &amp; Thorns — Admin</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0d0b14; color: #e8e3f0; margin: 0; padding: 32px; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .subtitle { color: #9d94b3; font-size: 0.9rem; margin: 0 0 28px; }
  h2 { font-size: 1.05rem; margin: 28px 0 10px; color: #d4b981; }
  h2.section-needs-fix { color: #f0a3ae; }
  h2.section-accepted { color: #7d7590; font-size: 0.95rem; margin-top: 40px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 8px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #2a2438; vertical-align: top; }
  th { color: #9d94b3; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
  tr:hover { background: #17131f; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 600; }
  .badge-high { background: #4a1d24; color: #f0a3ae; }
  .badge-medium { background: #4a3a1d; color: #e0b96a; }
  .badge-low { background: #1d2f4a; color: #8fb6e8; }
  .badge-type { background: #2a2438; color: #b9a9e0; }
  .empty { color: #6b6280; font-style: italic; padding: 12px 0; }
  .refresh { color: #9d94b3; font-size: 0.78rem; }
  .refresh a { color: #d4b981; }
  .muted { color: #6b6280; font-size: 0.78rem; }
  .accepted-section { margin-top: 8px; opacity: 0.85; }
  .accepted-section summary { cursor: pointer; color: #9d94b3; font-size: 0.85rem; padding: 8px 0; }
  .accepted-section .note { color: #6b6280; font-style: italic; }
  details { border-top: 1px solid #221d2e; }
</style>
</head>
<body>
  <h1>Prose &amp; Thorns — Admin</h1>
  <p class="subtitle">${messages.length} message(s) &middot; ${reports.length} reader report(s) &middot; ${needsFix.length} finding${needsFix.length === 1 ? '' : 's'} need attention &middot; ${accepted.length} reviewed, no action needed &middot;
    <span class="refresh"><a href="?password=${password}">refresh</a></span>
  </p>

  <h2>Messages (${messages.length})</h2>
  ${
    messages.length === 0
      ? '<p class="empty">No new messages.</p>'
      : `<table><thead><tr><th>Received</th><th>Type</th><th>From</th><th>Details</th><th>Message</th></tr></thead><tbody>${messageRows}</tbody></table>`
  }

  <h2>Reader Reports (${reports.length})</h2>
  ${
    reports.length === 0
      ? '<p class="empty">No open reader reports.</p>'
      : `<table><thead><tr><th>Reported</th><th>Category</th><th>Book</th><th>Message</th><th>Reporter</th></tr></thead><tbody>${reportRows}</tbody></table>`
  }

  <h2 class="section-needs-fix">Needs Attention (${needsFix.length})</h2>
  ${
    needsFix.length === 0
      ? '<p class="empty">Nothing outstanding.</p>'
      : `<table><thead><tr><th>Severity</th><th>Category</th><th>Book</th><th>Message</th></tr></thead><tbody>${needsFixRows}</tbody></table>`
  }

  <h2 class="section-accepted">Reviewed — No Action Needed (${accepted.length})</h2>
  <div class="accepted-section">
    ${accepted.length === 0 ? '<p class="empty">Nothing reviewed yet.</p>' : acceptedGroups}
  </div>
</body>
</html>`);
});

export default router;
