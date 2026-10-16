import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db/index.js';
import { log, sleep } from './util.js';

// Mirrors Open Library cover images into frontend/public/covers/ so they ship
// with the site as static files. Hotlinked Open Library covers redirect through
// archive.org and take 2-3s each; a local copy loads like any other asset and
// doesn't depend on a third party staying up. Rewrites books.cover_url to the
// local path (/covers/<id>.jpg). Safe to re-run: only books still pointing at
// openlibrary.org are touched.
//
// Usage: node mirrorCovers.js   (then commit frontend/public/covers/ and run export-slim)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'covers');
fs.mkdirSync(OUT_DIR, { recursive: true });

const MIN_BYTES = 8000; // anything smaller is a placeholder / error body, not cover art
const isJpeg = (b) => b[0] === 0xff && b[1] === 0xd8;
const isPng = (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

const books = db.prepare("SELECT id, title, cover_url FROM books WHERE cover_url LIKE '%openlibrary.org%'").all();
const update = db.prepare("UPDATE books SET cover_url = ?, updated_at = datetime('now') WHERE id = ?");
log(`${books.length} Open Library covers to mirror`);

let ok = 0;
const failed = [];
for (const b of books) {
  try {
    const res = await fetch(b.cover_url, { headers: { 'User-Agent': 'prose-and-thorns cover mirror' }, redirect: 'follow', signal: AbortSignal.timeout(45000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MIN_BYTES) throw new Error(`only ${buf.length} bytes`);
    const ext = isJpeg(buf) ? 'jpg' : isPng(buf) ? 'png' : null;
    if (!ext) throw new Error('not a JPEG/PNG');
    const file = `${b.id}.${ext}`;
    fs.writeFileSync(path.join(OUT_DIR, file), buf);
    update.run(`/covers/${file}`, b.id);
    ok += 1;
  } catch (err) {
    failed.push({ id: b.id, title: b.title, reason: err.message });
    log(`  #${b.id} "${b.title}": ${err.message} -- left pointing at Open Library`);
  }
  await sleep(500);
}
db.pragma('wal_checkpoint(TRUNCATE)');
log(`Mirrored ${ok}/${books.length}; ${failed.length} failed.`);
