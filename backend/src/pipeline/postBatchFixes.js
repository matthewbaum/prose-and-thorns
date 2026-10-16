import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import db from '../db/index.js';
import { synthesizeQuality } from './claudeSynthesis.js';
import { ROMANCE_TROPE_VALUES, PLOT_TROPE_VALUES } from './claudeTagging.js';
import { getReviewsForBook, saveQualityProfile } from '../db/pipelineRepo.js';
import { normalizeText } from './auditCatalog.js';
import { log } from './util.js';

// Deterministic cleanup run after each batch of addFromUcsdPool.js, before the
// audit: fixes the classes of audit finding that bulk additions reliably
// produce, so the audit reflects real problems instead of known batch noise.
//  1. series_total disagreement between books of one series -> the largest
//     value wins (a larger total means a longer-running series; the smaller
//     numbers are books tagged before later volumes were known).
//  2. tropes outside the taxonomy -> moved to the other trope list if they
//     belong there, otherwise dropped.
//  3. praise not verbatim in the description (as fixUngroundedPraise.js).
//  4. books whose Google Books match shares no word with the seed title ->
//     removed and recorded as skipped (wrong book; not safe to tag/synthesize).
//  6. recently added books whose Google cover is one of Google's two known
//     "image not available" graphics -> cover cleared (title card shows instead).
//  5. books with reviews but no synthesized profile (e.g. a transient model
//     JSON error) -> synthesize again, with the same quote-grounding check.

const PROGRESS_PATH = '/tmp/goodreads-check/run-progress.json';
const DIMENSIONS = ['prose_quality', 'romance_quality', 'world_building', 'pacing_quality', 'emotional_payoff', 'character_depth'];
const parseArr = (t) => { try { const v = JSON.parse(t); return Array.isArray(v) ? v : []; } catch { return []; } };
const words = (s) => new Set((s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));

// 4. wrong-book matches (do first so later steps skip removed rows)
const progress = fs.existsSync(PROGRESS_PATH) ? JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8')) : { done: {} };
const byBookId = new Map(Object.entries(progress.done).filter(([, v]) => v.book_id).map(([k, v]) => [v.book_id, k]));
for (const b of db.prepare('SELECT id, seed_title, title FROM books').all()) {
  if (!byBookId.has(b.id) || !b.seed_title || !b.title) continue;
  const seed = words(b.seed_title), got = words(b.title);
  if (seed.size > 0 && ![...seed].some((w) => got.has(w))) {
    log(`#${b.id} seed "${b.seed_title}" matched "${b.title}" (no shared word) -- removing`);
    // audit_findings / finding_dispositions reference books without cascade.
    for (const t of ['audit_findings', 'finding_dispositions']) db.prepare(`DELETE FROM ${t} WHERE book_id = ?`).run(b.id);
    db.prepare('DELETE FROM books WHERE id = ?').run(b.id);
    const key = byBookId.get(b.id);
    progress.done[key] = { ...progress.done[key], status: 'skipped', reason: `google-books-title-mismatch (got "${b.title}")`, book_id: undefined };
  }
}
fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));

// 1. series totals
const groups = db.prepare('SELECT series_name, MAX(series_total) AS m, COUNT(DISTINCT series_total) AS n FROM books WHERE series_name IS NOT NULL AND series_total IS NOT NULL GROUP BY series_name HAVING n > 1').all();
for (const g of groups) {
  const r = db.prepare('UPDATE books SET series_total = ? WHERE series_name = ? AND series_total IS NOT ?').run(g.m, g.series_name, g.m);
  log(`series "${g.series_name}": series_total set to ${g.m} on ${r.changes} book(s)`);
}

// 1b. a series' total can never be smaller than its highest known position
const raised = db.prepare(
  `UPDATE books SET series_total = (SELECT MAX(b2.series_position) FROM books b2 WHERE b2.series_name = books.series_name)
   WHERE series_name IS NOT NULL AND series_total IS NOT NULL
     AND series_total < (SELECT MAX(b2.series_position) FROM books b2 WHERE b2.series_name = books.series_name)`
).run();
if (raised.changes) log(`series_total raised to the highest known position on ${raised.changes} book(s)`);

// 2. out-of-taxonomy tropes
const ROMANCE = new Set(ROMANCE_TROPE_VALUES), PLOT = new Set(PLOT_TROPE_VALUES);
for (const b of db.prepare('SELECT id, title, romance_tropes, plot_tropes FROM books').all()) {
  const rom = parseArr(b.romance_tropes), plot = parseArr(b.plot_tropes);
  const newRom = rom.filter((t) => ROMANCE.has(t));
  const moved = rom.filter((t) => !ROMANCE.has(t) && PLOT.has(t));
  const newPlot = [...new Set([...plot.filter((t) => PLOT.has(t)), ...moved])];
  if (newRom.length !== rom.length || newPlot.length !== plot.length) {
    log(`#${b.id} "${b.title}": tropes normalized (dropped ${[...rom, ...plot].filter((t) => !ROMANCE.has(t) && !PLOT.has(t)).join(', ') || 'none'}; moved ${moved.join(', ') || 'none'})`);
    db.prepare('UPDATE books SET romance_tropes = ?, plot_tropes = ? WHERE id = ?').run(JSON.stringify(newRom), JSON.stringify(newPlot), b.id);
  }
}

// 3. ungrounded praise
for (const b of db.prepare('SELECT id, title, description, editorial_review, praise FROM books').all()) {
  const list = parseArr(b.praise);
  if (!list.length) continue;
  const src = normalizeText(`${b.description || ''} ${b.editorial_review || ''}`);
  const kept = list.filter((q) => { const n = normalizeText(q); return n && src.includes(n); });
  if (kept.length !== list.length) {
    log(`#${b.id} "${b.title}": dropped ${list.length - kept.length} ungrounded praise entr${list.length - kept.length === 1 ? 'y' : 'ies'}`);
    db.prepare('UPDATE books SET praise = ? WHERE id = ?').run(JSON.stringify(kept), b.id);
  }
}

// 5. missing syntheses
const ungrounded = (profile, reviews) => {
  const texts = reviews.map((r) => normalizeText(r.text));
  return DIMENSIONS.filter((d) => {
    const q = profile[d]?.representative_quote;
    return q && q.trim() && !texts.some((t) => t.includes(normalizeText(q)));
  });
};
const missing = db.prepare(
  `SELECT b.id, b.title, b.author, b.ucsd_avg_rating, b.ucsd_ratings_count FROM books b
   WHERE b.quality_synthesized_at IS NULL AND EXISTS (SELECT 1 FROM reviews r WHERE r.book_id = b.id AND r.source = 'ucsd')`
).all();
for (const b of missing) {
  const reviews = getReviewsForBook(b.id);
  const run = () => synthesizeQuality({ title: b.title, author: b.author, avgRating: b.ucsd_avg_rating, ratingsCount: b.ucsd_ratings_count, reviews });
  let profile = null;
  for (let i = 0; i < 3 && !profile; i++) { try { profile = await run(); } catch (e) { log(`#${b.id} synthesis attempt ${i + 1} failed: ${e.message.slice(0, 80)}`); } }
  if (!profile) { log(`#${b.id} "${b.title}": synthesis still failing -- left for next pass`); continue; }
  let bad = ungrounded(profile, reviews);
  if (bad.length) {
    try { const retry = await run(); if (retry) profile = retry; } catch {}
    bad = ungrounded(profile, reviews);
    for (const d of bad) profile[d].representative_quote = '';
  }
  saveQualityProfile(b.id, profile);
  log(`#${b.id} "${b.title}": synthesis completed (dropped ${bad.length} ungrounded quote(s))`);
}
// 6. fake Google covers (identical images served for books Google has no art for)
const FAKE_COVER_SHAS = new Set(['3efa8c43e5b4348f', '5e7f0425abc77878']);
const recentGoogleCovers = db
  .prepare("SELECT id, title, cover_url FROM books WHERE cover_url LIKE '%books.google.%' AND updated_at > datetime('now', '-6 hours')")
  .all();
for (const b of recentGoogleCovers) {
  try {
    const res = await fetch(b.cover_url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) continue;
    const sha = crypto.createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex').slice(0, 16);
    if (FAKE_COVER_SHAS.has(sha)) {
      db.prepare("UPDATE books SET cover_url = NULL, updated_at = datetime('now') WHERE id = ?").run(b.id);
      log(`#${b.id} "${b.title}": Google "image not available" cover cleared`);
    }
  } catch {
    /* network blip: leave it for the end-of-run pass */
  }
}
db.pragma('wal_checkpoint(TRUNCATE)');
log('Post-batch fixes done.');
