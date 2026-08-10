export const SPICE_ORDER = ['clean', 'low', 'medium', 'high', 'very-high'];
export const DARKNESS_ORDER = ['light', 'moderate', 'dark', 'very-dark'];
// "Complete" for sorting purposes: nothing left to wait on. A duology/series
// still ongoing is excluded regardless of how many books are already out.
export const COMPLETE_SERIES_STATUSES = ['standalone', 'series-complete', 'duology-complete'];

// 'correction' submission categories — coarse triage buckets, not an
// exhaustive taxonomy, so a reader reporting something that doesn't fit any
// of them still has 'other' rather than being blocked.
export const CORRECTION_CATEGORIES = [
  'wrong-cover',
  'wrong-quality-score',
  'wrong-series-info',
  'wrong-author',
  'other',
];

export const QUALITY_DIMENSIONS = [
  'prose_quality',
  'romance_quality',
  'world_building',
  'pacing_quality',
  'emotional_payoff',
  'character_depth',
];

export const MIN_FILTER_TO_DIMENSION = {
  min_prose: 'prose_quality',
  min_romance: 'romance_quality',
  min_world_building: 'world_building',
  min_pacing: 'pacing_quality',
  min_emotional_payoff: 'emotional_payoff',
  min_character_depth: 'character_depth',
};

export const SORT_TO_DIMENSION = {
  prose_quality: 'prose_quality',
  romance_quality: 'romance_quality',
  world_building: 'world_building',
  pacing_quality: 'pacing_quality',
  emotional_payoff: 'emotional_payoff',
  character_depth: 'character_depth',
};
