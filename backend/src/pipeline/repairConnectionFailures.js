import 'dotenv/config';
import fs from 'node:fs';
import db from '../db/index.js';
import { tagBook } from './claudeTagging.js';
import { saveTags } from '../db/pipelineRepo.js';
import { log, sleep } from './util.js';

// One-off: after a network outage, books from the UCSD bulk run were created
// (metadata + reviews saved) but their tagging/synthesis calls failed with
// "Connection error". This tags them and re-applies UCSD's series info;
// postBatchFixes.js then synthesizes the missing quality profiles.
const PROGRESS = '/tmp/goodreads-check/run-progress.json';
const pool = JSON.parse(fs.readFileSync('/tmp/goodreads-check/pool-final.json', 'utf8'));
const progress = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
const untagged = db.prepare('SELECT id, seed_title, seed_author, title, author, description, editorial_review FROM books WHERE tagged_at IS NULL AND (description IS NOT NULL AND description != \'\')').all();
log(`${untagged.length} untagged books with a description`);
const setSeries = db.prepare("UPDATE books SET series_name = ?, series_position = ?, updated_at = datetime('now') WHERE id = ?");
let done = 0;
for (const b of untagged) {
  const item = pool.find((p) => p.title === b.seed_title && p.author === b.seed_author);
  let tags = null;
  for (let i = 0; i < 3 && !tags; i++) {
    try { tags = await tagBook({ title: b.title, author: b.author, description: b.description, editorialReview: b.editorial_review }); }
    catch (e) { log(`  #${b.id} tagging attempt ${i + 1} failed: ${e.message.slice(0, 60)}`); await sleep(5000); }
  }
  if (!tags) continue;
  saveTags(b.id, tags);
  if (item?.series_name) setSeries.run(item.series_name, Number(item.series_position), b.id);
  if (item) {
    const key = String(item.gr_book_id);
    progress.done[key] = { title: item.title, author: item.author, status: 'ok', book_id: b.id, source: 'repaired-after-network-outage' };
  }
  done += 1;
  log(`  #${b.id} "${b.title}": tagged`);
  await sleep(500);
}
fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2));
db.pragma('wal_checkpoint(TRUNCATE)');
log(`Tagged ${done}/${untagged.length}. progress file updated for those books.`);
