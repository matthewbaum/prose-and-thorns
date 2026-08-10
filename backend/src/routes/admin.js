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

function loadFindings() {
  const auditFindings = db
    .prepare(
      `SELECT id, 'audit' as source, severity, category, message, book_id, status, run_at as created_at
       FROM audit_findings WHERE status = 'open' ORDER BY
       CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, run_at DESC`
    )
    .all();

  const reports = db
    .prepare(
      `SELECT id, 'reader-report' as source, category, message, book_id, book_title, name, email, status, created_at
       FROM submissions WHERE type = 'correction' AND status = 'new' ORDER BY created_at DESC`
    )
    .all();

  return { auditFindings, reports };
}

router.get('/findings', (req, res) => {
  if (!checkPassword(req, res)) return;
  res.json(loadFindings());
});

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SEVERITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

// Raw JSON at /findings only renders readably in browsers with a built-in
// JSON viewer (Chrome/Firefox) — Safari just dumps it as an unformatted
// wall of text. This is the same data, rendered as an actual page, so
// "check the admin findings" doesn't require a specific browser.
router.get('/dashboard', (req, res) => {
  if (!checkPassword(req, res)) return;
  const { auditFindings, reports } = loadFindings();
  const password = escapeHtml(req.query.password || '');

  const bySeverity = { high: [], medium: [], low: [] };
  for (const f of auditFindings) bySeverity[f.severity]?.push(f);

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

  const severitySections = ['high', 'medium', 'low']
    .map((sev) => {
      const items = bySeverity[sev];
      if (items.length === 0) return '';
      const rows = items
        .map(
          (f) => `
    <tr>
      <td><span class="badge badge-${sev}">${SEVERITY_LABEL[sev]}</span></td>
      <td>${escapeHtml(f.category)}</td>
      <td>${f.book_id ? `#${f.book_id}` : '—'}</td>
      <td>${escapeHtml(f.message)}</td>
    </tr>`
        )
        .join('');
      return `
  <h2>${SEVERITY_LABEL[sev]} (${items.length})</h2>
  <table>
    <thead><tr><th>Severity</th><th>Category</th><th>Book</th><th>Message</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
    })
    .join('');

  res.send(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Prose &amp; Thorns — Catalog Findings</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0d0b14; color: #e8e3f0; margin: 0; padding: 32px; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .subtitle { color: #9d94b3; font-size: 0.9rem; margin: 0 0 28px; }
  h2 { font-size: 1.05rem; margin: 28px 0 10px; color: #d4b981; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 8px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #2a2438; vertical-align: top; }
  th { color: #9d94b3; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
  tr:hover { background: #17131f; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 600; }
  .badge-high { background: #4a1d24; color: #f0a3ae; }
  .badge-medium { background: #4a3a1d; color: #e0b96a; }
  .badge-low { background: #1d2f4a; color: #8fb6e8; }
  .empty { color: #6b6280; font-style: italic; padding: 12px 0; }
  .refresh { color: #9d94b3; font-size: 0.78rem; }
  .refresh a { color: #d4b981; }
</style>
</head>
<body>
  <h1>Catalog Findings</h1>
  <p class="subtitle">${auditFindings.length} open audit finding(s) &middot; ${reports.length} reader report(s) &middot;
    <span class="refresh"><a href="?password=${password}">refresh</a></span>
  </p>

  <h2>Reader Reports (${reports.length})</h2>
  ${
    reports.length === 0
      ? '<p class="empty">No open reader reports.</p>'
      : `<table><thead><tr><th>Reported</th><th>Category</th><th>Book</th><th>Message</th><th>Reporter</th></tr></thead><tbody>${reportRows}</tbody></table>`
  }

  ${severitySections || '<p class="empty">No open audit findings.</p>'}
</body>
</html>`);
});

export default router;
