import { Router } from 'express';
import { runPipeline } from '../pipeline/runPipeline.js';
import { status } from '../pipeline/status.js';

const router = Router();

function checkPassword(req, res) {
  const provided = req.body?.password || req.query?.password || req.headers['x-admin-password'];
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

// POST /api/seed — trigger the pipeline. Not user-facing.
router.post('/', (req, res) => {
  if (!checkPassword(req, res)) return;

  if (status.running) {
    res.status(409).json({ error: 'Pipeline already running', status });
    return;
  }

  runPipeline().catch((err) => {
    console.error('[pipeline] fatal error:', err);
  });

  res.status(202).json({ message: 'Pipeline started', status });
});

// GET /api/seed/status — check progress. Not password-protected (no sensitive data).
router.get('/status', (req, res) => {
  res.json(status);
});

export default router;
