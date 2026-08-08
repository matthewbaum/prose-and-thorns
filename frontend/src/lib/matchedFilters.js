import {
  SERIES_STATUS,
  AGE_CATEGORY,
  PUBLISHER_TYPE,
  SERIES_LENGTH,
  SPICE_LEVELS,
  DARKNESS_LEVELS,
} from '../constants/taxonomy.js';
import { SUBGENRE_LABEL, TROPE_LABEL } from './labels.js';

function labelLookup(options) {
  return Object.fromEntries(options.map((o) => [o.value, o.label]));
}

const SERIES_STATUS_LABEL = labelLookup(SERIES_STATUS);
const AGE_CATEGORY_LABEL = labelLookup(AGE_CATEGORY);
const PUBLISHER_TYPE_LABEL = labelLookup(PUBLISHER_TYPE);
const SPICE_LABEL = labelLookup(SPICE_LEVELS);
const DARKNESS_LABEL = labelLookup(DARKNESS_LEVELS);

function seriesLengthBucket(total) {
  if (total == null) return null;
  if (total === 1) return '1';
  if (total === 2) return '2';
  if (total === 3) return '3';
  if (total >= 4 && total <= 5) return '4-5';
  if (total >= 6) return '6+';
  return null;
}

// Only the inclusion-style, categorical filters get a "why this matched" chip.
// Content warnings are an exclusion filter (every result already lacks them,
// so highlighting one would be backwards), and the quality-score sliders are
// a numeric threshold, not a category — neither fits this pattern.
export function getMatchedFilters(book, filters) {
  const matches = [];

  if (filters.series_status?.length > 0 && book.series_status && filters.series_status.includes(book.series_status)) {
    matches.push({ key: `status-${book.series_status}`, label: SERIES_STATUS_LABEL[book.series_status] });
  }

  if (filters.age_category?.length > 0 && book.age_category && filters.age_category.includes(book.age_category)) {
    matches.push({ key: `age-${book.age_category}`, label: AGE_CATEGORY_LABEL[book.age_category] });
  }

  if (filters.publisher_type?.length > 0 && book.publisher_type && filters.publisher_type.includes(book.publisher_type)) {
    matches.push({ key: `publisher-${book.publisher_type}`, label: PUBLISHER_TYPE_LABEL[book.publisher_type] });
  }

  if (filters.series_length?.length > 0) {
    const bucket = seriesLengthBucket(book.series_total);
    if (bucket && filters.series_length.includes(bucket)) {
      const opt = SERIES_LENGTH.find((o) => o.value === bucket);
      matches.push({ key: `length-${bucket}`, label: opt?.label || bucket });
    }
  }

  if (filters.subgenre?.length > 0 && book.subgenre && filters.subgenre.includes(book.subgenre)) {
    matches.push({ key: `subgenre-${book.subgenre}`, label: SUBGENRE_LABEL[book.subgenre] });
  }
  if (filters.subgenre?.includes('lgbtq') && book.lgbtq === 'yes') {
    matches.push({ key: 'subgenre-lgbtq', label: 'LGBTQ+' });
  }

  if (filters.spice_level?.length > 0 && book.spice_level && filters.spice_level.includes(book.spice_level)) {
    matches.push({ key: `spice-${book.spice_level}`, label: SPICE_LABEL[book.spice_level] });
  }

  if (filters.darkness_level?.length > 0 && book.darkness_level && filters.darkness_level.includes(book.darkness_level)) {
    matches.push({ key: `darkness-${book.darkness_level}`, label: DARKNESS_LABEL[book.darkness_level] });
  }

  const bookTropes = [...(book.romance_tropes || []), ...(book.plot_tropes || [])];
  const activeTropes = [...(filters.romance_tropes || []), ...(filters.plot_tropes || [])];
  for (const t of activeTropes) {
    if (bookTropes.includes(t)) {
      matches.push({ key: `trope-${t}`, label: TROPE_LABEL[t] || t });
    }
  }

  return matches;
}
