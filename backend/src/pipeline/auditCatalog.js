import db from '../db/index.js';
import { WRONG_PRODUCT_PATTERN } from './googleBooks.js';
import { resolveCoverUrl } from '../db/booksRepo.js';
import {
  SERIES_STATUS_VALUES,
  AGE_CATEGORY_VALUES,
  PUBLISHER_TYPE_VALUES,
  SUBGENRE_VALUES,
  ROMANCE_TROPE_VALUES,
  PLOT_TROPE_VALUES,
  SPICE_LEVEL_VALUES,
  DARKNESS_LEVEL_VALUES,
  LGBTQ_VALUES,
  CONTENT_WARNING_VALUES,
  EMOTIONAL_TONE_VALUES,
  PACING_VALUES,
} from './claudeTagging.js';
import {
  SUBGENRE,
  ROMANCE_TROPES,
  PLOT_TROPES,
  CONTENT_WARNINGS,
  DARKNESS_LEVELS,
} from '../../../frontend/src/constants/taxonomy.js';

// Never auto-fixes catalog data — ambiguous findings (a thin review count,
// an author mismatch that might be a legitimate co-author) need a human
// judgment call, matching this project's existing "flag rather than
// silently decide" pattern. It does persist its own findings (see
// audit_findings below) so a run's results survive after the terminal
// closes and are queryable via /api/admin/findings, instead of being
// print-only output a human has to be watching to catch.

const THIN_REVIEW_COUNT_THRESHOLD = 10;

const findings = { high: [], medium: [], low: [] };
// bookId is optional — plenty of findings (taxonomy drift, cross-catalog
// duplicates) aren't about one specific row. Passed through when the
// caller has a single book in scope so persisted findings can link back to
// it (see persistFindings below).
function flag(severity, category, message, bookId = null) {
  findings[severity].push({ category, message, bookId });
}

function parseJsonArraySafe(text) {
  if (!text) return { ok: true, value: [] };
  try {
    const value = JSON.parse(text);
    if (!Array.isArray(value)) return { ok: false, value: null };
    return { ok: true, value };
  } catch {
    return { ok: false, value: null };
  }
}

// Strips quote marks and dash variants entirely (not just canonicalizes
// them) — verified case: a description wraps a pull-quote in curly quotes
// ("Dark, larcenous fun." —NPR) while the correctly-extracted `praise`
// array entry has already dropped those wrapping quote marks, so a
// canonicalize-only normalization still fails to match and produces a
// false "possibly fabricated" flag on a genuinely verbatim extraction.
// Google Books description/editorial_review text is raw HTML with entities
// (&amp;, &#39;, &quot;) while the model's extracted praise/quote text is
// plain decoded text — an entity-blind comparison flags genuinely verbatim
// extractions as "possibly fabricated" (verified case: "Quicksilver"'s
// praise entry matches editorial_review exactly except "&" vs "&amp;").
function decodeEntities(s) {
  return (s || '')
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

function normalizeTokens(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 2);
}

// ---- 1. Static taxonomy drift: backend TAG_PROMPT vs frontend taxonomy.js ----
function taxonomyOptionValues(options) {
  return options.map((o) => o.value);
}

function checkTaxonomyDrift() {
  const pairs = [
    ['subgenre', SUBGENRE_VALUES, taxonomyOptionValues(SUBGENRE)],
    ['romance_tropes', ROMANCE_TROPE_VALUES, taxonomyOptionValues(ROMANCE_TROPES)],
    ['plot_tropes', PLOT_TROPE_VALUES, taxonomyOptionValues(PLOT_TROPES)],
    ['content_warnings', CONTENT_WARNING_VALUES, taxonomyOptionValues(CONTENT_WARNINGS)],
    ['darkness_level', DARKNESS_LEVEL_VALUES, taxonomyOptionValues(DARKNESS_LEVELS)],
  ];
  // 'lgbtq' is a deliberate pseudo-value in the frontend's SUBGENRE filter
  // list — it's derived from the separate `lgbtq` column (see
  // matchedFilters.js / filterBooks.js special-casing it), not a real
  // subgenre the tagging prompt ever assigns, so it's expected to be
  // "missing from backend" and isn't drift.
  const IGNORE_MISSING_FROM_BACKEND = new Set(['lgbtq']);

  for (const [field, backendValues, frontendValues] of pairs) {
    const backendSet = new Set(backendValues);
    const frontendSet = new Set(frontendValues);
    const missingFromFrontend = backendValues.filter((v) => !frontendSet.has(v));
    const missingFromBackend = frontendValues.filter((v) => !backendSet.has(v) && !IGNORE_MISSING_FROM_BACKEND.has(v));
    if (missingFromFrontend.length > 0) {
      flag(
        'high',
        'taxonomy-drift',
        `${field}: backend allows [${missingFromFrontend.join(', ')}] but frontend has no label/filter for them — a correctly-tagged book would be unfilterable and show a raw fallback label.`
      );
    }
    if (missingFromBackend.length > 0) {
      flag(
        'medium',
        'taxonomy-drift',
        `${field}: frontend offers [${missingFromBackend.join(', ')}] as a filter option but the tagging prompt never allows the model to assign them — dead filter, will never match anything.`
      );
    }
  }
}

// ---- Load all books once ----
const ALL_TAXONOMY = {
  series_status: SERIES_STATUS_VALUES,
  age_category: AGE_CATEGORY_VALUES,
  publisher_type: PUBLISHER_TYPE_VALUES,
  subgenre: SUBGENRE_VALUES,
  spice_level: SPICE_LEVEL_VALUES,
  darkness_level: DARKNESS_LEVEL_VALUES,
  lgbtq: LGBTQ_VALUES,
  emotional_tone: EMOTIONAL_TONE_VALUES,
  pacing: PACING_VALUES,
};
const ARRAY_TAXONOMY = {
  romance_tropes: ROMANCE_TROPE_VALUES,
  plot_tropes: PLOT_TROPE_VALUES,
  content_warnings: CONTENT_WARNING_VALUES,
};
const JSON_ARRAY_COLUMNS = ['romance_tropes', 'plot_tropes', 'content_warnings', 'praise', 'series_titles'];

function checkPerRowTaxonomyValidity(books) {
  for (const b of books) {
    for (const [field, allowed] of Object.entries(ALL_TAXONOMY)) {
      const value = b[field];
      if (value != null && value !== '' && !allowed.includes(value)) {
        flag('high', 'invalid-tag-value', `#${b.id} "${b.title || b.seed_title}": ${field} = "${value}" is not in the allowed taxonomy — likely a hallucinated tag value.`, b.id);
      }
    }
    for (const [field, allowed] of Object.entries(ARRAY_TAXONOMY)) {
      const { ok, value } = parseJsonArraySafe(b[field]);
      if (!ok) continue; // reported separately by checkMalformedJson
      for (const v of value) {
        if (!allowed.includes(v)) {
          flag('high', 'invalid-tag-value', `#${b.id} "${b.title || b.seed_title}": ${field} contains "${v}", not in the allowed taxonomy — likely a hallucinated tag value.`, b.id);
        }
      }
    }
  }
}

function checkMalformedJson(books) {
  for (const b of books) {
    for (const col of JSON_ARRAY_COLUMNS) {
      const raw = b[col];
      if (!raw) continue;
      const { ok } = parseJsonArraySafe(raw);
      if (!ok) {
        flag('high', 'malformed-json', `#${b.id} "${b.title || b.seed_title}": ${col} is not valid JSON array — "${raw.slice(0, 80)}"`, b.id);
      }
    }
  }
}

// ---- Series consistency ----
function checkSeriesConsistency(books) {
  const bySeries = new Map();
  for (const b of books) {
    if (!b.series_name) continue;
    if (!bySeries.has(b.series_name)) bySeries.set(b.series_name, []);
    bySeries.get(b.series_name).push(b);
  }
  for (const [seriesName, siblings] of bySeries) {
    const totals = new Set(siblings.map((s) => s.series_total).filter((t) => t != null));
    if (totals.size > 1) {
      flag(
        'high',
        'series-total-disagreement',
        `Series "${seriesName}": siblings disagree on series_total — ${siblings.map((s) => `#${s.id} "${s.title}"=${s.series_total ?? 'null'}`).join(', ')}`
      );
    }
    const positions = siblings.map((s) => s.series_position).filter((p) => p != null);
    const seenPositions = new Map();
    for (const s of siblings) {
      if (s.series_position == null) continue;
      if (seenPositions.has(s.series_position)) {
        flag(
          'high',
          'series-position-duplicate',
          `Series "${seriesName}": position ${s.series_position} used by both #${seenPositions.get(s.series_position)} and #${s.id} ("${s.title}")`,
          s.id
        );
      } else {
        seenPositions.set(s.series_position, s.id);
      }
      // Lower bound is 0, not 1: prequel novellas are legitimately numbered
      // "0.5" in this catalog's convention (verified case: "The Assassin's
      // Blade" as Throne of Glass #0.5) — only flag positions that are
      // negative or that exceed the series total.
      const total = s.series_total;
      if (total != null && (s.series_position < 0 || s.series_position > total)) {
        flag('medium', 'series-position-out-of-range', `#${s.id} "${s.title}": series_position ${s.series_position} is outside [0, ${total}]`, s.id);
      }
    }
  }
}

// ---- Fetch/match integrity ----
function checkFetchIntegrity(books) {
  for (const b of books) {
    if (b.google_books_fetched_at && (!b.title || !b.author)) {
      flag('high', 'broken-row', `#${b.id} (seed "${b.seed_title}" by ${b.seed_author}): google_books_fetched_at is set but title/author is still null — fetch silently produced nothing.`, b.id);
    }
    const isStub = b.google_books_id && b.google_books_id.endsWith('ACAAJ');
    if (isStub && !b.hardcover_cover_url) {
      flag('medium', 'stub-cover', `#${b.id} "${b.title}": google_books_id ${b.google_books_id} is an ACAAJ stub (no real cover) with no Hardcover cover fallback.`, b.id);
    }
    if (b.title && WRONG_PRODUCT_PATTERN.test(b.title)) {
      flag('high', 'wrong-product-title', `#${b.id}: title "${b.title}" matches the wrong-product pattern (box set / special edition / sample / etc.) — likely matched the wrong Google Books edition.`, b.id);
    }
    if (!b.cover_url && !b.hardcover_cover_url) {
      flag('medium', 'no-cover-art', `#${b.id} "${b.title}": no cover art from either Google Books or Hardcover.`, b.id);
    }
    if (b.seed_author && b.author) {
      const seedTokens = new Set(normalizeTokens(b.seed_author));
      const authorTokens = new Set(normalizeTokens(b.author));
      const overlap = [...seedTokens].some((t) => authorTokens.has(t));
      if (!overlap && seedTokens.size > 0) {
        flag('medium', 'author-mismatch', `#${b.id} "${b.title}": author "${b.author}" shares no name with seed_author "${b.seed_author}" — verify this is the right book/edition.`, b.id);
      }
    }
    // Verified case: #306's seed "Fatal Truths" matched an unrelated 1892
    // public-domain scan whose OCR'd index text happened to contain the
    // author's exact name as a substring — author-mismatch (above) had
    // nothing to catch since the author field coincidentally matched. No
    // existing check ever compares the matched TITLE against seed_title,
    // so a wrong match with a coincidentally-right author was completely
    // invisible. This closes that gap independent of the author field.
    if (b.seed_title && b.title) {
      const seedTitleTokens = new Set(normalizeTokens(b.seed_title));
      const titleTokens = new Set(normalizeTokens(b.title));
      const titleOverlap = [...seedTitleTokens].some((t) => titleTokens.has(t));
      if (!titleOverlap && seedTitleTokens.size > 0) {
        flag('high', 'title-mismatch', `#${b.id}: matched title "${b.title}" shares no word with seed_title "${b.seed_title}" — likely matched an unrelated book entirely.`, b.id);
      }
    }
    // Verified case: #274 ("The Fallen Ones," a seed title that turned out
    // not to exist — the real book was "The Eternal Ones") had title/author
    // both null (Google Books correctly found nothing), but Hardcover's
    // fuzzy matcher still landed on an unrelated real book ("The Gilded
    // Ones," book 1 of the same series, already separately catalogued) and
    // pulled its full review set + quality-profile synthesis under this
    // row's fake identity. Neither author-mismatch nor title-mismatch
    // (above) can catch this — both require a non-null title/author to
    // compare against. This is a distinct, cheaper signal: any Hardcover
    // match at all on a row Google Books never identified is inherently
    // unverifiable (nothing to check the match against) and should be
    // flagged regardless of what it matched.
    if (!b.title && !b.author && (b.hardcover_url || b.hardcover_ratings_count != null)) {
      flag('high', 'unverified-hardcover-match', `#${b.id} (seed "${b.seed_title}" by ${b.seed_author}): Google Books never identified this book (title/author null) but Hardcover matched something anyway (${b.hardcover_url || 'no url'}) — this match can't be verified against anything and may belong to an unrelated book.`, b.id);
    }
    // seedVerification.js runs a live-web-search Claude check once per new
    // seed, before Google Books — this surfaces whatever it found. exists
    // === 0 is a strong signal (the seed itself may be fabricated, the
    // root cause of every case in the 2026-08-14 hallucination sweep);
    // confidence === 'low' with exists === 1 is weaker (a real but
    // thin-web-presence title) and stays 'medium' rather than 'high'.
    if (b.seed_verification_exists === 0) {
      flag('high', 'seed-not-verified', `#${b.id} (seed "${b.seed_title}" by ${b.seed_author}): seed verification found no evidence this book exists — ${b.seed_verification_note || 'no note'}`, b.id);
    } else if (b.seed_verification_confidence === 'low') {
      flag('medium', 'seed-not-verified', `#${b.id} (seed "${b.seed_title}" by ${b.seed_author}): seed verification was low-confidence — ${b.seed_verification_note || 'no note'}`, b.id);
    }
    if (b.hardcover_ratings_count != null && b.hardcover_ratings_count > 0 && b.hardcover_ratings_count < THIN_REVIEW_COUNT_THRESHOLD) {
      flag('low', 'thin-hardcover-match', `#${b.id} "${b.title}": only ${b.hardcover_ratings_count} Hardcover ratings — verify this matched the right/canonical edition (worth checking for a title-variant mismatch, e.g. diacritics).`, b.id);
    }
    // A ratings_count of exactly 0 is a stronger signal than "thin" — it
    // usually means the match landed on an unrelated zero-rated duplicate
    // edition while the real, populated edition exists under a slightly
    // different title string (verified: "Babel" and "Circe" both did this).
    // Previously excluded by "> 0" above, so this case was silently invisible.
    if (b.hardcover_url && b.hardcover_ratings_count === 0) {
      flag('medium', 'zero-rated-hardcover-match', `#${b.id} "${b.title}": matched Hardcover edition has 0 ratings — likely matched an unrelated duplicate stub instead of the real, populated edition.`, b.id);
    }
    if (b.description && !b.tagged_at) {
      flag('medium', 'never-tagged', `#${b.id} "${b.title}": has a description but was never tagged (tagged_at is null).`, b.id);
    }
  }
}

// Verified case: book #282's cover_url returned HTTP 200 and looked
// completely normal, but was a 9103-byte "no cover available" graphic, not
// real art — no-cover-art (above) only catches a null URL, which this one
// wasn't. A follow-up catalog-wide scan found 44 more books doing the same
// thing. Small-file-size is a cheap, real signal for the common case, but
// isn't complete on its own — a manual fix pass on those 44 also turned up
// a 246KB blank template graphic that this size check alone would miss, so
// this stays a "verify manually" flag, never an auto-fix.
const COVER_SIZE_THRESHOLD_BYTES = 15000;
const COVER_CHECK_CONCURRENCY = 8;

async function fetchCoverSize(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return null;
    const len = res.headers.get('content-length');
    return len ? Number(len) : null;
  } catch {
    return null;
  }
}

// Must check the URL resolveCoverUrl() actually serves to users, not the
// raw cover_url column — resolveCoverUrl() prefers hardcover_cover_url
// whenever it's set, so checking cover_url alone both misses bad
// hardcover_cover_url values entirely and false-flags books where cover_url
// looks bad but hardcover_cover_url (what's actually shown) is fine.
// Verified case: 38 of the 43 "cover_url" fixes made in one pass were
// silently irrelevant on the live site because hardcover_cover_url was
// already set on those rows and takes priority.
async function checkCoverImageIntegrity(books) {
  const candidates = books
    .map((b) => ({ book: b, url: resolveCoverUrl(b) }))
    .filter((c) => c.url);
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const { book: b, url } = candidates[cursor++];
      const size = await fetchCoverSize(url);
      if (size != null && size < COVER_SIZE_THRESHOLD_BYTES) {
        flag(
          'low',
          'placeholder-cover-suspected',
          `#${b.id} "${b.title}": resolved cover (${url}) returns only ${size} bytes — likely a placeholder graphic, not real cover art. Verify visually before replacing (a wrong cover is worse than a missing one).`,
          b.id
        );
      }
    }
  }
  await Promise.all(Array.from({ length: COVER_CHECK_CONCURRENCY }, worker));
}

function checkDuplicateTitles(books) {
  const byTitle = new Map();
  for (const b of books) {
    if (!b.title) continue;
    if (!byTitle.has(b.title)) byTitle.set(b.title, []);
    byTitle.get(b.title).push(b.id);
  }
  for (const [title, ids] of byTitle) {
    if (ids.length > 1) {
      flag('high', 'duplicate-title', `Title "${title}" appears in ${ids.length} rows: ${ids.map((i) => `#${i}`).join(', ')}`);
    }
  }
}

// Verified case: The Midnight Library, The Song of Achilles, and The Name
// of the Wind (all pre-existing seed picks, general fantasy/literary
// fiction rather than romance-forward) were dominating the "Trending now"
// homepage shelf, which sorts by raw popularity with no genre-relevance
// filter — mainstream crossover titles structurally out-rank niche
// romantasy on pure rating volume. Their romance_tropes counts (1, 2, 3)
// were clearly separated from genuinely romantasy titles like Fourth Wing
// (7) and ACOTAR (6), so a low count is a real, cheap signal — not proof
// a book doesn't belong in the catalog (some slow-burn romantasy is
// thin on explicit trope tags), but worth a human glance before it
// surfaces on a popularity-sorted shelf.
const LOW_ROMANCE_TROPE_THRESHOLD = 2;

function checkGenreFit(books) {
  for (const b of books) {
    if (!b.title || !b.romance_tropes) continue;
    let tropes;
    try {
      tropes = JSON.parse(b.romance_tropes);
    } catch {
      continue;
    }
    if (!Array.isArray(tropes)) continue;
    if (tropes.length <= LOW_ROMANCE_TROPE_THRESHOLD) {
      flag(
        'low',
        'thin-romance-content',
        `#${b.id} "${b.title}": only ${tropes.length} romance trope(s) tagged (spice: ${b.spice_level || 'unset'}) — verify this is genuinely romance-forward before it surfaces on a popularity-sorted shelf.`,
        b.id
      );
    }
  }
}

function checkMissingSynthesis(books) {
  const bookIds = books.filter((b) => !b.quality_synthesized_at).map((b) => b.id);
  if (bookIds.length === 0) return;
  const placeholders = bookIds.map(() => '?').join(',');
  const reviewCounts = db
    .prepare(`SELECT book_id, COUNT(*) as n FROM reviews WHERE book_id IN (${placeholders}) GROUP BY book_id`)
    .all(...bookIds);
  const countByBook = new Map(reviewCounts.map((r) => [r.book_id, r.n]));
  for (const b of books) {
    if (b.quality_synthesized_at) continue;
    const n = countByBook.get(b.id) || 0;
    if (n > 0) {
      flag('medium', 'missing-synthesis', `#${b.id} "${b.title}": has ${n} reviews but quality_synthesized_at is null — synthesis silently never completed (likely a past API error).`, b.id);
    }
  }
}

// ---- Grounding checks: is AI-generated content actually real? ----
function checkQuoteGrounding(books) {
  const bookIds = books.map((b) => b.id);
  if (bookIds.length === 0) return;
  const profiles = db.prepare('SELECT * FROM quality_profiles').all();
  const profileByBook = new Map(profiles.map((p) => [p.book_id, p]));
  const allReviews = db.prepare('SELECT book_id, text FROM reviews').all();
  const reviewTextByBook = new Map();
  for (const r of allReviews) {
    if (!reviewTextByBook.has(r.book_id)) reviewTextByBook.set(r.book_id, []);
    reviewTextByBook.get(r.book_id).push(normalizeText(r.text));
  }

  const DIMENSIONS = ['prose_quality', 'romance_quality', 'world_building', 'pacing_quality', 'emotional_payoff', 'character_depth'];

  for (const b of books) {
    const profile = profileByBook.get(b.id);
    if (!profile) continue;
    const reviewTexts = reviewTextByBook.get(b.id) || [];
    if (reviewTexts.length === 0) continue;
    for (const dim of DIMENSIONS) {
      const quote = profile[`${dim}_quote`];
      if (!quote || !quote.trim()) continue;
      const normalizedQuote = normalizeText(quote);
      const grounded = reviewTexts.some((text) => text.includes(normalizedQuote));
      if (!grounded) {
        flag(
          'high',
          'ungrounded-quote',
          `#${b.id} "${b.title}": ${dim} representative_quote "${quote}" is not a substring of any stored review — possibly paraphrased or fabricated, not a real excerpt.`,
          b.id
        );
      }
    }
  }
}

function checkPraiseGrounding(books) {
  for (const b of books) {
    const { ok, value: praiseList } = parseJsonArraySafe(b.praise);
    if (!ok || praiseList.length === 0) continue;
    const sourceText = normalizeText(`${b.description || ''} ${b.editorial_review || ''}`);
    if (!sourceText) continue;
    for (const quote of praiseList) {
      const normalizedQuote = normalizeText(quote);
      if (normalizedQuote && !sourceText.includes(normalizedQuote)) {
        flag(
          'medium',
          'ungrounded-praise',
          `#${b.id} "${b.title}": praise entry "${quote}" is not found verbatim in description/editorial_review — TAG_PROMPT requires praise to be extracted verbatim, so this may be invented.`,
          b.id
        );
      }
    }
  }
}

function printReport() {
  const order = ['high', 'medium', 'low'];
  const labels = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW (verify manually)' };
  let total = 0;
  for (const sev of order) {
    const items = findings[sev];
    total += items.length;
    if (items.length === 0) continue;
    console.log(`\n=== ${labels[sev]} — ${items.length} finding(s) ===`);
    const byCategory = new Map();
    for (const f of items) {
      if (!byCategory.has(f.category)) byCategory.set(f.category, []);
      byCategory.get(f.category).push(f.message);
    }
    for (const [category, messages] of byCategory) {
      console.log(`\n  [${category}] (${messages.length})`);
      for (const m of messages) console.log(`    - ${m}`);
    }
  }
  console.log(`\n${total === 0 ? 'Clean — no findings.' : `TOTAL: ${total} finding(s) (${findings.high.length} high, ${findings.medium.length} medium, ${findings.low.length} low)`}`);
}

// Each run replaces the prior snapshot rather than accumulating duplicate
// rows for the same catalog state — 'resolved' findings from a genuinely
// fixed issue are meant to disappear, not pile up as stale noise, and an
// admin viewing /api/admin/findings should see "what's wrong right now,"
// not a growing history of every run ever made.
const insertFinding = db.prepare(
  `INSERT INTO audit_findings (severity, category, message, book_id) VALUES (@severity, @category, @message, @bookId)`
);
function persistFindings() {
  db.prepare(`DELETE FROM audit_findings`).run();
  const insertMany = db.transaction(() => {
    for (const severity of ['high', 'medium', 'low']) {
      for (const f of findings[severity]) insertFinding.run({ ...f, severity });
    }
  });
  insertMany();
}

export async function runAudit() {
  checkTaxonomyDrift();
  const books = db.prepare('SELECT * FROM books').all();
  checkPerRowTaxonomyValidity(books);
  checkMalformedJson(books);
  checkSeriesConsistency(books);
  checkFetchIntegrity(books);
  checkDuplicateTitles(books);
  checkGenreFit(books);
  checkMissingSynthesis(books);
  checkQuoteGrounding(books);
  checkPraiseGrounding(books);
  await checkCoverImageIntegrity(books);
  persistFindings();
  printReport();
}

// Allow running directly: `npm run audit`
if (import.meta.url === `file://${process.argv[1]}`) {
  runAudit();
}
