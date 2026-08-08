import { SPICE_ORDER } from '../constants.js';

// There's no user-behavior data to build a real collaborative filter on, so
// "similar books" is scored from catalog metadata overlap with the seed
// books the reader picked. Two modes:
//   'any' — union across all seeds (candidate can match what any one pick
//           has). This is the useful default once you select more than one
//           or two books — requiring overlap with every pick at once tends
//           to return almost nothing in a ~100-book catalog.
//   'all' — intersection: only recommend books that share something every
//           single seed has in common (e.g. all seeds are the same
//           subgenre, or all share a trope). Can legitimately return zero
//           results if the seeds don't actually have anything tagged in
//           common with each other.
//
// Trope/subgenre matches are weighted by rarity (IDF-style) against the
// whole catalog, not treated as flat yes/no. In this catalog political
// intrigue, hidden/discovered power, and forbidden love each show up in
// well over half the books — a shared "match" on one of those is close to
// meaningless, and without weighting it dominates scoring and makes 'all'
// mode's intersection collapse to whatever generic trope everything has,
// defeating the point of the stricter mode.

function toLabel(value) {
  const titled = value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  // Title-casing turns the MMC/FMC trope acronyms into "Mmc"/"Fmc" — fix
  // those back up rather than hardcoding a full label map on the backend.
  return titled.replace(/\bMmc\b/g, 'MMC').replace(/\bFmc\b/g, 'FMC');
}

function mostCommon(values) {
  if (values.length === 0) return null;
  const counts = new Map();
  let best = null;
  let bestCount = 0;
  for (const v of values) {
    const count = (counts.get(v) || 0) + 1;
    counts.set(v, count);
    if (count > bestCount) {
      best = v;
      bestCount = count;
    }
  }
  return best;
}

function tropesOf(book) {
  return new Set([...(book.romance_tropes || []), ...(book.plot_tropes || [])]);
}

function buildTropeWeights(allBooks) {
  const freq = new Map();
  for (const book of allBooks) {
    for (const t of tropesOf(book)) {
      freq.set(t, (freq.get(t) || 0) + 1);
    }
  }
  const total = allBooks.length;
  // IDF-style: common-across-the-catalog tropes approach a low floor instead
  // of zero (still a real, if weak, signal), rare tropes score much higher.
  return (trope) => Math.log((total + 1) / ((freq.get(trope) || 0) + 1)) + 0.2;
}

// A shared subgenre is inherently a stronger, more deliberate signal than a
// shared trope (candidates only have one, so it's the closest thing to a
// primary category) — weight it fixed-high rather than by rarity.
const SUBGENRE_MATCH_WEIGHT = 4;
// A trope at this weight corresponds to roughly <=40% catalog frequency —
// the gate below requires at least one shared element this specific, rather
// than letting several individually-generic tropes add up to "in common."
// Summing would let e.g. two ~65%-frequency tropes together clear the bar,
// which defeats the point of the stricter mode (see similarity.js header).
const MIN_ALL_MODE_GROUND_WEIGHT = 1.1;

function scoreCandidateAny(candidate, seeds, tropeWeight) {
  let score = 0;
  const reasons = [];

  const seedSubgenres = new Set(seeds.map((s) => s.subgenre).filter(Boolean));
  if (candidate.subgenre && seedSubgenres.has(candidate.subgenre)) {
    score += SUBGENRE_MATCH_WEIGHT;
    reasons.push({ key: `subgenre-${candidate.subgenre}`, label: toLabel(candidate.subgenre) });
  }

  const seedTropes = new Set(seeds.flatMap((s) => [...tropesOf(s)]));
  const candidateTropes = [...tropesOf(candidate)];
  const sharedTropes = candidateTropes.filter((t) => seedTropes.has(t));
  let tropeScore = 0;
  for (const t of sharedTropes) {
    tropeScore += tropeWeight(t);
    reasons.push({ key: `trope-${t}`, label: toLabel(t) });
  }
  score += Math.min(tropeScore, 8);

  const seedSpiceIdxs = seeds.map((s) => SPICE_ORDER.indexOf(s.spice_level)).filter((i) => i >= 0);
  const candidateSpiceIdx = SPICE_ORDER.indexOf(candidate.spice_level);
  if (seedSpiceIdxs.length > 0 && candidateSpiceIdx >= 0) {
    const avgSpice = seedSpiceIdxs.reduce((a, b) => a + b, 0) / seedSpiceIdxs.length;
    if (Math.abs(candidateSpiceIdx - avgSpice) <= 1) {
      score += 2;
      reasons.push({ key: `spice-${candidate.spice_level}`, label: toLabel(candidate.spice_level) });
    }
  }

  const commonAgeCategory = mostCommon(seeds.map((s) => s.age_category).filter(Boolean));
  if (commonAgeCategory && candidate.age_category === commonAgeCategory) {
    score += 2;
    reasons.push({ key: `age-${candidate.age_category}`, label: toLabel(candidate.age_category) });
  }

  const lgbtqSeedCount = seeds.filter((s) => s.lgbtq === 'yes').length;
  if (lgbtqSeedCount > seeds.length / 2 && candidate.lgbtq === 'yes') {
    score += 2;
    reasons.push({ key: 'lgbtq', label: 'LGBTQ+' });
  }

  // Quality is a tie-breaker, not the main signal — this is about taste
  // match, so it shouldn't be able to out-rank real overlap.
  score += (candidate.overall_score || 0) * 0.3;

  return { score, reasons, matched: reasons.length > 0 };
}

function seedIntersections(seeds) {
  const subgenres = seeds.map((s) => s.subgenre).filter(Boolean);
  const commonSubgenre =
    subgenres.length === seeds.length && new Set(subgenres).size === 1 ? subgenres[0] : null;

  let commonTropes = tropesOf(seeds[0] || {});
  for (const s of seeds.slice(1)) {
    const t = tropesOf(s);
    commonTropes = new Set([...commonTropes].filter((x) => t.has(x)));
  }

  const ageCategories = seeds.map((s) => s.age_category).filter(Boolean);
  const commonAgeCategory =
    ageCategories.length === seeds.length && new Set(ageCategories).size === 1 ? ageCategories[0] : null;

  const commonLgbtq = seeds.every((s) => s.lgbtq === 'yes') ? 'yes' : null;

  return { commonSubgenre, commonTropes, commonAgeCategory, commonLgbtq };
}

function scoreCandidateAll(candidate, intersections, tropeWeight) {
  let score = 0;
  const reasons = [];
  let maxCoreWeight = 0;

  if (intersections.commonSubgenre && candidate.subgenre === intersections.commonSubgenre) {
    score += 5;
    maxCoreWeight = Math.max(maxCoreWeight, SUBGENRE_MATCH_WEIGHT);
    reasons.push({ key: `subgenre-${candidate.subgenre}`, label: toLabel(candidate.subgenre) });
  }

  const candidateTropes = [...tropesOf(candidate)];
  const sharedCoreTropes = candidateTropes.filter((t) => intersections.commonTropes.has(t));
  for (const t of sharedCoreTropes) {
    const w = tropeWeight(t);
    maxCoreWeight = Math.max(maxCoreWeight, w);
    score += w * 2;
    reasons.push({ key: `trope-${t}`, label: toLabel(t) });
  }

  if (intersections.commonAgeCategory && candidate.age_category === intersections.commonAgeCategory) {
    score += 1;
    reasons.push({ key: `age-${candidate.age_category}`, label: toLabel(candidate.age_category) });
  }

  if (intersections.commonLgbtq && candidate.lgbtq === 'yes') {
    score += 1;
    reasons.push({ key: 'lgbtq', label: 'LGBTQ+' });
  }

  score += (candidate.overall_score || 0) * 0.3;

  // Several individually-generic shared tropes shouldn't be able to add up
  // to "meaningful overlap" — require at least one shared element (subgenre
  // or a single trope) specific enough to clear the bar on its own.
  return { score, reasons, matched: maxCoreWeight >= MIN_ALL_MODE_GROUND_WEIGHT };
}

export function getRecommendations(allBooks, seeds, limit = Infinity, mode = 'any') {
  const seedIds = new Set(seeds.map((s) => s.id));
  const candidates = allBooks.filter((b) => !seedIds.has(b.id));
  const tropeWeight = buildTropeWeights(allBooks);

  if (mode === 'all') {
    const intersections = seedIntersections(seeds);
    const tropeWeights = [...intersections.commonTropes].map(tropeWeight);
    const groundWeight = Math.max(
      intersections.commonSubgenre ? SUBGENRE_MATCH_WEIGHT : 0,
      tropeWeights.length > 0 ? Math.max(...tropeWeights) : 0
    );
    if (groundWeight < MIN_ALL_MODE_GROUND_WEIGHT) {
      return { books: [], noCommonGround: true };
    }
    const books = candidates
      .map((candidate) => ({ candidate, ...scoreCandidateAll(candidate, intersections, tropeWeight) }))
      .filter((r) => r.matched)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => ({ ...r.candidate, match_reasons: r.reasons }));
    return { books, noCommonGround: false };
  }

  const books = candidates
    .map((candidate) => ({ candidate, ...scoreCandidateAny(candidate, seeds, tropeWeight) }))
    .filter((r) => r.matched)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => ({ ...r.candidate, match_reasons: r.reasons }));
  return { books, noCommonGround: false };
}
