import { SORT_TO_DIMENSION, MIN_FILTER_TO_DIMENSION, COMPLETE_SERIES_STATUSES } from '../constants.js';

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
  // total == null means "we don't actually know" — that must not silently
  // match the "1 book" bucket, or every book with unknown length looks like
  // a standalone in the UI regardless of its real series length.
  if (total == null) return false;
  return lengths.some((len) => {
    if (len === '1') return total === 1;
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
  const seriesStatus = splitParam(query.series_status);
  const ageCategory = splitParam(query.age_category);
  const publisherType = splitParam(query.publisher_type);
  const seriesLength = splitParam(query.series_length);
  const rawSubgenre = splitParam(query.subgenre);
  const wantsLgbtq = rawSubgenre.includes('lgbtq');
  const subgenre = rawSubgenre.filter((v) => v !== 'lgbtq');
  const romanceTropes = splitParam(query.romance_tropes);
  const plotTropes = splitParam(query.plot_tropes);
  const excludeWarnings = splitParam(query.exclude_warnings);
  // Not a min/max range: a reader might want "clean or high" without
  // wanting everything in between, so selection is an arbitrary subset,
  // same as every other checkbox filter — not a contiguous ordinal range.
  const spiceLevels = splitParam(query.spice_level);
  const darknessLevels = splitParam(query.darkness_level);

  // Driven by MIN_FILTER_TO_DIMENSION so all six dimensions stay filterable
  // by construction — verified case: pacing and character depth were fully
  // scored and stored for every book already, but had no min_* query param
  // wired up here at all, so they silently couldn't be filtered on despite
  // the data being complete.
  const minDimensionFilters = Object.entries(MIN_FILTER_TO_DIMENSION).map(([param, dimension]) => ({
    dimension,
    min: Number(query[param] || 1),
  }));
  const minOverall = Number(query.min_overall || 1);

  return books.filter((book) => {
    if (seriesStatus.length > 0 && !seriesStatus.includes(book.series_status)) return false;
    if (ageCategory.length > 0 && !ageCategory.includes(book.age_category)) return false;
    if (publisherType.length > 0 && !publisherType.includes(book.publisher_type)) return false;
    if (!matchesSeriesLength(book, seriesLength)) return false;
    if (subgenre.length > 0 && !subgenre.includes(book.subgenre)) return false;
    if (wantsLgbtq && book.lgbtq !== 'yes') return false;
    if (!matchesAny(book.romance_tropes, romanceTropes)) return false;
    if (!matchesAny(book.plot_tropes, plotTropes)) return false;

    if (spiceLevels.length > 0 && !spiceLevels.includes(book.spice_level)) return false;
    if (darknessLevels.length > 0 && !darknessLevels.includes(book.darkness_level)) return false;

    if (excludeWarnings.length > 0) {
      const hasExcluded = book.content_warnings.some((w) => excludeWarnings.includes(w));
      if (hasExcluded) return false;
    }

    const qp = book.quality_profile;
    for (const { dimension, min } of minDimensionFilters) {
      if (min > 1 && (!qp || qp[dimension].score < min)) return false;
    }
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
  } else if (sort === 'overall_score') {
    // Pure overall-quality sort, no ratings-count tiebreak — distinct from
    // best-match, which folds in review volume as a secondary signal.
    sorted.sort((a, b) => (b.overall_score ?? -1) - (a.overall_score ?? -1));
  } else if (sort === 'most-reviewed') {
    sorted.sort((a, b) => (b.quality_profile?.review_count_used ?? 0) - (a.quality_profile?.review_count_used ?? 0));
  } else if (sort === 'newest') {
    sorted.sort((a, b) => (b.publication_date || '').localeCompare(a.publication_date || ''));
  } else if (sort === 'complete-first') {
    // A stable partition, not a full reorder — Array.sort is stable (ES2019+),
    // so books within "complete" and within "ongoing" keep whatever relative
    // order they arrived in (match strength, quality, etc.), just split into
    // two groups rather than interleaved.
    const isComplete = (b) => COMPLETE_SERIES_STATUSES.includes(b.series_status);
    sorted.sort((a, b) => Number(isComplete(b)) - Number(isComplete(a)));
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
