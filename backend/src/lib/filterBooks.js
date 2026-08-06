import { SPICE_ORDER, SORT_TO_DIMENSION } from '../constants.js';

function splitParam(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function matchesSeriesLength(book, lengths) {
  if (lengths.length === 0) return true;
  const total = book.series_total;
  return lengths.some((len) => {
    if (len === '1') return total == null || total === 1;
    if (len === '2') return total === 2;
    if (len === '3') return total === 3;
    if (len === '4-5') return total != null && total >= 4 && total <= 5;
    if (len === '6+') return total != null && total >= 6;
    return false;
  });
}

function matchesAny(list, selected) {
  if (selected.length === 0) return true;
  return selected.some((value) => list.includes(value));
}

export function applyFilters(books, query) {
  const seriesStatus = query.series_status && query.series_status !== 'any' ? query.series_status : null;
  const seriesLength = splitParam(query.series_length);
  const rawSubgenre = splitParam(query.subgenre);
  const wantsLgbtq = rawSubgenre.includes('lgbtq');
  const subgenre = rawSubgenre.filter((v) => v !== 'lgbtq');
  const romanceTropes = splitParam(query.romance_tropes);
  const plotTropes = splitParam(query.plot_tropes);
  const excludeWarnings = splitParam(query.exclude_warnings);

  const spiceMin = query.spice_min ? SPICE_ORDER.indexOf(query.spice_min) : -1;
  const spiceMax = query.spice_max ? SPICE_ORDER.indexOf(query.spice_max) : -1;

  const minProse = Number(query.min_prose || 1);
  const minRomance = Number(query.min_romance || 1);
  const minWorldBuilding = Number(query.min_world_building || 1);
  const minEmotionalPayoff = Number(query.min_emotional_payoff || 1);
  const minOverall = Number(query.min_overall || 1);

  return books.filter((book) => {
    if (seriesStatus && book.series_status !== seriesStatus) return false;
    if (!matchesSeriesLength(book, seriesLength)) return false;
    if (subgenre.length > 0 && !subgenre.includes(book.subgenre)) return false;
    if (wantsLgbtq && book.lgbtq !== 'yes') return false;
    if (!matchesAny(book.romance_tropes, romanceTropes)) return false;
    if (!matchesAny(book.plot_tropes, plotTropes)) return false;

    if (spiceMin >= 0 && book.spice_level) {
      const idx = SPICE_ORDER.indexOf(book.spice_level);
      if (idx < spiceMin || idx > spiceMax) return false;
    }

    if (excludeWarnings.length > 0) {
      const hasExcluded = book.content_warnings.some((w) => excludeWarnings.includes(w));
      if (hasExcluded) return false;
    }

    const qp = book.quality_profile;
    if (minProse > 1 && (!qp || qp.prose_quality.score < minProse)) return false;
    if (minRomance > 1 && (!qp || qp.romance_quality.score < minRomance)) return false;
    if (minWorldBuilding > 1 && (!qp || qp.world_building.score < minWorldBuilding)) return false;
    if (minEmotionalPayoff > 1 && (!qp || qp.emotional_payoff.score < minEmotionalPayoff)) return false;
    if (minOverall > 1 && (!qp || qp.overall_score == null || qp.overall_score < minOverall)) return false;

    return true;
  });
}

export function applySort(books, sort) {
  const sorted = [...books];
  const dimension = SORT_TO_DIMENSION[sort];

  if (dimension) {
    sorted.sort((a, b) => {
      const aScore = a.quality_profile?.[dimension]?.score ?? -1;
      const bScore = b.quality_profile?.[dimension]?.score ?? -1;
      return bScore - aScore;
    });
  } else if (sort === 'most-reviewed') {
    sorted.sort((a, b) => (b.quality_profile?.review_count_used ?? 0) - (a.quality_profile?.review_count_used ?? 0));
  } else if (sort === 'newest') {
    sorted.sort((a, b) => (b.publication_date || '').localeCompare(a.publication_date || ''));
  } else {
    // best-match: prefer higher overall quality score, fall back to Google Books rating volume
    sorted.sort((a, b) => {
      const aOverall = a.overall_score ?? -1;
      const bOverall = b.overall_score ?? -1;
      if (bOverall !== aOverall) return bOverall - aOverall;
      return (b.ratings_count || 0) - (a.ratings_count || 0);
    });
  }

  return sorted;
}
