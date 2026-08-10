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
    res.status(401).json({ error: 'Invalid admin password' });
    return false;
  }
  return true;
}

router.get('/findings', (req, res) => {
  if (!checkPassword(req, res)) return;

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

  res.json({ auditFindings, reports });
});

export default router;
