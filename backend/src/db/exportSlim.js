import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import Database from 'better-sqlite3';
import db, { DB_PATH, FULL_DB_PATH, SLIM_DB_PATH } from './index.js';
import { sampledReviewsAvgRating } from './booksRepo.js';

// Builds the committed/deployed database (SLIM_DB_PATH) from the full local
// one: identical catalog, tags, quality profiles, ratings, audit findings --
// minus the raw review text, which is most of the file and isn't displayed
// anywhere on the live site. See index.js for why there are two files.
//
// Run before every commit that should change what's deployed:
//   npm run export-slim        (from backend/)
//
// It also writes a dated, gzip-compressed snapshot of the FULL database to
// PT_BACKUP_DIR (set in backend/.env -- machine-specific, so not committed),
// because the full copy is gitignored and otherwise exists only on this
// machine. Keeps the newest KEEP_BACKUPS; only files matching this script's
// own naming pattern are ever pruned.

const mb = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(1) + ' MB';

if (DB_PATH !== FULL_DB_PATH) {
  console.error(
    `Refusing to export: this process opened ${DB_PATH}, not the full database at\n${FULL_DB_PATH}.\n` +
      'Exporting from the slim copy would permanently lose the review text it no longer has.'
  );
  process.exit(1);
}

// 1. Refresh the denormalized review stats on the full database. These are
// what stand in for the reviews table once its contents are stripped.
const refresh = db.transaction(() => {
  const ids = db.prepare('SELECT id FROM books').all().map((r) => r.id);
  const count = db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE book_id = ?');
  const update = db.prepare(
    'UPDATE books SET stored_review_count = ?, sampled_avg_rating = ?, sampled_ratings_count = ? WHERE id = ?'
  );
  for (const id of ids) {
    const sampled = sampledReviewsAvgRating(id);
    update.run(count.get(id).n, sampled?.rating ?? null, sampled?.count ?? null, id);
  }
  return ids.length;
});
const bookCount = refresh();
db.pragma('wal_checkpoint(TRUNCATE)');

// 2. Compacted copy of the full file, then strip the reviews.
const tmp = SLIM_DB_PATH + '.tmp';
for (const f of [tmp, tmp + '-wal', tmp + '-shm']) if (fs.existsSync(f)) fs.rmSync(f);
db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);

// 2b. Off-machine backup of the complete snapshot, before reviews are stripped.
const KEEP_BACKUPS = 7;
const BACKUP_RE = /^prose-and-thorns-full-\d{4}-\d{2}-\d{2}\.sqlite\.gz$/;
const sha256 = async (stream) => {
  const h = crypto.createHash('sha256');
  for await (const chunk of stream) h.update(chunk);
  return h.digest('hex');
};
let backupReport;
const backupDir = process.env.PT_BACKUP_DIR;
if (!backupDir) {
  backupReport = 'SKIPPED: PT_BACKUP_DIR is not set in backend/.env, so the full database (with review text) is NOT backed up anywhere off this machine.';
} else {
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    const dest = path.join(backupDir, `prose-and-thorns-full-${new Date().toLocaleDateString('en-CA')}.sqlite.gz`);
    await pipeline(fs.createReadStream(tmp), zlib.createGzip({ level: 9 }), fs.createWriteStream(dest + '.partial'));
    // Read the backup back and compare against the snapshot before trusting it.
    const [orig, restored] = await Promise.all([
      sha256(fs.createReadStream(tmp)),
      sha256(fs.createReadStream(dest + '.partial').pipe(zlib.createGunzip())),
    ]);
    if (orig !== restored) throw new Error('backup failed read-back verification');
    fs.renameSync(dest + '.partial', dest);
    const stale = fs.readdirSync(backupDir).filter((f) => BACKUP_RE.test(f)).sort().reverse().slice(KEEP_BACKUPS);
    for (const f of stale) fs.rmSync(path.join(backupDir, f));
    backupReport = `${dest} (${mb(dest)}, verified by read-back${stale.length ? `; pruned ${stale.length} older` : ''})`;
  } catch (err) {
    backupReport = `FAILED: ${err.message} -- the slim export still completed, but the full database was NOT backed up.`;
  }
}

const slim = new Database(tmp);
const reviewRows = slim.prepare('SELECT COUNT(*) AS n FROM reviews').get().n;
slim.exec('DELETE FROM reviews');
// A single self-contained file: no -wal/-shm sidecars to commit or lose.
slim.pragma('journal_mode = DELETE');
slim.exec('VACUUM');
const stats = {
  books: slim.prepare('SELECT COUNT(*) AS n FROM books').get().n,
  withStoredReviews: slim.prepare('SELECT COUNT(*) AS n FROM books WHERE stored_review_count > 0').get().n,
  submissions: slim.prepare('SELECT COUNT(*) AS n FROM submissions').get().n,
  clicks: slim.prepare('SELECT COUNT(*) AS n FROM retailer_clicks').get().n,
};
slim.close();

// 3. Swap into place (rename is atomic on the same filesystem).
for (const f of [SLIM_DB_PATH + '-wal', SLIM_DB_PATH + '-shm']) if (fs.existsSync(f)) fs.rmSync(f);
const before = fs.existsSync(SLIM_DB_PATH) ? mb(SLIM_DB_PATH) : 'none';
fs.renameSync(tmp, SLIM_DB_PATH);

console.log(`Slim export written to ${SLIM_DB_PATH}`);
console.log(`  full database : ${mb(FULL_DB_PATH)}`);
console.log(`  slim (before) : ${before}`);
console.log(`  slim (now)    : ${mb(SLIM_DB_PATH)}`);
console.log(`  ${stats.books} books (stats refreshed for ${bookCount}); ${stats.withStoredReviews} carry a stored review count`);
console.log(`  ${reviewRows} review rows stripped from the slim copy (full copy untouched)`);
console.log(`  backup        : ${backupReport}`);
if (stats.submissions || stats.clicks) {
  console.warn(
    `  WARNING: slim copy contains ${stats.submissions} submission(s) and ${stats.clicks} retailer click(s) from the local database -- ` +
      'confirm those are not test data before committing.'
  );
}
