export const SERIES_STATUS = [
  { value: 'any', label: 'Any' },
  { value: 'standalone', label: 'Standalone' },
  { value: 'series-complete', label: 'Complete series' },
  { value: 'series-ongoing', label: 'Ongoing series' },
  { value: 'duology-complete', label: 'Duology (complete)' },
  { value: 'duology-ongoing', label: 'Duology (ongoing)' },
];

export const AGE_CATEGORY = [
  { value: 'any', label: 'Any' },
  { value: 'young-adult', label: 'Young Adult' },
  { value: 'new-adult', label: 'New Adult' },
  { value: 'adult', label: 'Adult' },
];

export const PUBLISHER_TYPE = [
  { value: 'any', label: 'Any' },
  { value: 'traditional-major', label: 'Major Publisher (Big 5)' },
  { value: 'traditional-indie', label: 'Indie/Specialty Press' },
  { value: 'self-published', label: 'Self-Published' },
  { value: 'kindle-unlimited-exclusive', label: 'Kindle Unlimited Exclusive' },
];

export const SERIES_LENGTH = [
  { value: '1', label: '1 book (standalone)' },
  { value: '2', label: '2 books' },
  { value: '3', label: '3 books' },
  { value: '4-5', label: '4–5 books' },
  { value: '6+', label: '6+ books' },
];

export const SUBGENRE = [
  { value: 'fae-high-fantasy', label: 'Fae / High Fantasy' },
  { value: 'dragon-riders', label: 'Dragon Riders' },
  { value: 'vampire-dark-fantasy', label: 'Vampire / Dark Fantasy' },
  { value: 'witch-academy', label: 'Witch / Magic Academy' },
  { value: 'gods-mythology', label: 'Gods & Mythology' },
  { value: 'shifters-werewolves', label: 'Shifters / Werewolves' },
  { value: 'urban-fantasy', label: 'Urban Fantasy' },
  { value: 'epic-fantasy', label: 'Epic Fantasy' },
  { value: 'historical-fantasy', label: 'Historical Fantasy' },
  { value: 'dark-romance-fantasy', label: 'Dark Romance Fantasy' },
  { value: 'lgbtq', label: 'LGBTQ+ (any subgenre)' },
];

export const ROMANCE_TROPES = [
  { value: 'enemies-to-lovers', label: 'Enemies to Lovers' },
  { value: 'forced-proximity', label: 'Forced Proximity' },
  { value: 'slow-burn', label: 'Slow Burn' },
  { value: 'fated-mates', label: 'Fated Mates' },
  { value: 'forbidden-love', label: 'Forbidden Love' },
  { value: 'chosen-one', label: 'Chosen One' },
  { value: 'bodyguard-protector', label: 'Bodyguard / Protector' },
  { value: 'touch-her-and-die', label: 'Touch Her and Die' },
  { value: 'grumpy-sunshine', label: 'Grumpy / Sunshine' },
  { value: 'age-gap', label: 'Age Gap' },
  { value: 'morally-gray-mmc', label: 'Morally Gray MMC' },
  { value: 'reverse-harem', label: 'Reverse Harem' },
];

export const PLOT_TROPES = [
  { value: 'weak-to-strong-fmc', label: 'Weak to Strong FMC' },
  { value: 'hidden-discovered-power', label: 'Hidden / Discovered Power' },
  { value: 'corrupt-system-overthrown', label: 'Corrupt System Overthrown' },
  { value: 'political-intrigue', label: 'Political Intrigue' },
  { value: 'war-military', label: 'War / Military Setting' },
  { value: 'revenge-plot', label: 'Revenge Plot' },
  { value: 'lost-heir-identity', label: 'Lost Heir / Hidden Identity' },
];

export const SPICE_LEVELS = [
  { value: 'clean', label: 'Clean' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'very-high', label: 'Very High' },
];

export const QUALITY_DIMENSIONS = [
  { key: 'prose_quality', label: 'Prose Quality' },
  { key: 'romance_quality', label: 'Romance Quality' },
  { key: 'world_building', label: 'World-Building' },
  { key: 'pacing_quality', label: 'Pacing' },
  { key: 'emotional_payoff', label: 'Emotional Payoff' },
  { key: 'character_depth', label: 'Character Depth' },
];

export const MIN_QUALITY_FILTERS = [
  { key: 'min_prose', label: 'Prose quality' },
  { key: 'min_romance', label: 'Romance quality' },
  { key: 'min_world_building', label: 'World-building' },
  { key: 'min_emotional_payoff', label: 'Emotional payoff' },
  { key: 'min_overall', label: 'Overall' },
];

export const CONTENT_WARNINGS = [
  { value: 'sexual-violence', label: 'Sexual violence' },
  { value: 'graphic-violence', label: 'Graphic violence' },
  { value: 'cliffhanger-ending', label: 'Cliffhanger ending' },
  { value: 'major-character-death', label: 'Major character death' },
  { value: 'child-abuse-trauma', label: 'Child abuse / trauma' },
];

export const SORT_OPTIONS = [
  { value: 'best-match', label: 'Best match' },
  { value: 'prose_quality', label: 'Prose quality' },
  { value: 'romance_quality', label: 'Romance quality' },
  { value: 'world_building', label: 'World-building' },
  { value: 'emotional_payoff', label: 'Emotional payoff' },
  { value: 'most-reviewed', label: 'Most reviewed (confidence)' },
  { value: 'newest', label: 'Newest' },
];

export const SPICE_FLAME_COUNT = {
  clean: 0,
  low: 1,
  medium: 2,
  high: 3,
  'very-high': 4,
};
