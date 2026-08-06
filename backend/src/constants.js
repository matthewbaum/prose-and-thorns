export const SPICE_ORDER = ['clean', 'low', 'medium', 'high', 'very-high'];

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
  min_emotional_payoff: 'emotional_payoff',
};

export const SORT_TO_DIMENSION = {
  prose_quality: 'prose_quality',
  romance_quality: 'romance_quality',
  world_building: 'world_building',
  emotional_payoff: 'emotional_payoff',
};
