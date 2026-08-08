import { SUBGENRE, ROMANCE_TROPES, PLOT_TROPES } from '../constants/taxonomy.js';

function labelLookup(options) {
  return Object.fromEntries(options.map((o) => [o.value, o.label]));
}

export const SUBGENRE_LABEL = labelLookup(SUBGENRE);
export const TROPE_LABEL = labelLookup([...ROMANCE_TROPES, ...PLOT_TROPES]);

// Falls back to a plain dash-to-space split for any value not in the
// taxonomy (shouldn't normally happen) — but the taxonomy label is
// preferred specifically so acronyms like MMC/FMC stay correctly cased
// instead of being title-cased into "Mmc"/"Fmc".
export function tropeLabel(value) {
  return TROPE_LABEL[value] || value.replace(/-/g, ' ');
}

export function subgenreLabel(value) {
  return SUBGENRE_LABEL[value] || value.replace(/-/g, ' ');
}
