import 'dotenv/config';
import db from '../db/index.js';
import { log } from './util.js';

// TAG_PROMPT instructs the model to split praise out of description +
// editorial_review VERBATIM — nothing else. Audit found 32 praise entries
// that don't appear in that combined text; re-checking with HTML-entity
// decoding added (audit's normalizeText didn't decode &amp;/&#39;/etc.,
// producing 3 false positives) leaves 29 genuine violations — professional
// blurbs (Kirkus, Publishers Weekly, NPR, author blurbs) the model
// apparently recalled from training data rather than extracting from our
// actual scraped text. Since we can't verify per-item whether each is a
// real quote from elsewhere or partially invented, and the prompt's own
// contract requires verbatim-from-source, the safe fix is mechanical: keep
// only praise entries that are genuinely a substring of description +
// editorial_review, drop the rest. No LLM call, no risk of re-fabricating.

function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function normalizeText(s) {
  return decodeEntities(s || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArr(t) {
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const selectBooks = db.prepare('SELECT id, title, description, editorial_review, praise FROM books');
const updatePraise = db.prepare('UPDATE books SET praise = ? WHERE id = ?');

let booksChanged = 0;
let entriesDropped = 0;

for (const b of selectBooks.all()) {
  const praiseList = parseArr(b.praise);
  if (praiseList.length === 0) continue;
  const sourceText = normalizeText(`${b.description || ''} ${b.editorial_review || ''}`);
  const kept = praiseList.filter((quote) => {
    const nq = normalizeText(quote);
    return nq && sourceText.includes(nq);
  });
  if (kept.length !== praiseList.length) {
    const dropped = praiseList.filter((q) => !kept.includes(q));
    for (const d of dropped) log(`#${b.id} "${b.title}": dropping ungrounded praise "${d}"`);
    updatePraise.run(JSON.stringify(kept), b.id);
    booksChanged += 1;
    entriesDropped += dropped.length;
  }
}

log(`Done. ${entriesDropped} ungrounded praise entries removed across ${booksChanged} books.`);
