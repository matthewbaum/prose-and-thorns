import React, { useState } from 'react';
import { QUALITY_DIMENSIONS } from '../constants/taxonomy.js';
import ScoreMethodologyInfo from './ScoreMethodologyInfo.jsx';
import '../styles/QualityFilterPicker.css';

// Overall stays the default entry point (matches every book's headline
// score), but the same dropdown also reaches all six dimensions
// individually — a book can clear the bar overall while still being weak
// on, say, pacing specifically, and vice versa.
const QUALITY_DIMENSION_OPTIONS = [{ key: 'overall', label: 'Overall' }, ...QUALITY_DIMENSIONS];

export const DIMENSION_TO_PARAM = {
  overall: 'min_overall',
  prose_quality: 'min_prose',
  romance_quality: 'min_romance',
  world_building: 'min_world_building',
  pacing_quality: 'min_pacing',
  emotional_payoff: 'min_emotional_payoff',
  character_depth: 'min_character_depth',
};

// The "(Solid across the board)" style descriptions only make sense for
// Overall — an average across six dimensions. A single dimension like
// Pacing doesn't have a "board" to be solid across, so those tiers get
// plain "3+"/"4+" labels instead once a specific dimension is picked.
const OVERALL_TIER_LABELS = {
  '': 'Any quality',
  3: '3+ (Solid across the board)',
  3.5: '3.5+ (Strong across the board)',
  4: '4+ (Excellent across the board)',
  4.5: '4.5+ (Rare — exceptional)',
};
const TIER_VALUES = ['', '3', '3.5', '4', '4.5'];

export function qualityFiltersToPatch(qualityFilters) {
  const patch = {};
  qualityFilters.forEach(({ dimension, tier }) => {
    patch[DIMENSION_TO_PARAM[dimension]] = Number(tier);
  });
  return patch;
}

// Shared by QuickSearch (homepage) and the recommend results page — same
// "search, pick a minimum, it becomes a chip" interaction in both places,
// each dimension holding its own independent bar so a reader can require,
// say, Pacing 4+ AND Romance Quality 3.5+ at once.
export default function QualityFilterPicker({ value, onChange, label }) {
  const [pendingDimension, setPendingDimension] = useState('overall');
  const [pendingTier, setPendingTier] = useState('');

  const dimensionLabel = (key) => QUALITY_DIMENSION_OPTIONS.find((d) => d.key === key)?.label || key;

  const addQualityFilter = () => {
    if (!pendingTier) return;
    onChange([...value.filter((f) => f.dimension !== pendingDimension), { dimension: pendingDimension, tier: pendingTier }]);
    setPendingTier('');
  };

  const removeQualityFilter = (dimension) => {
    onChange(value.filter((f) => f.dimension !== dimension));
  };

  return (
    <div className="quality-filter-picker">
      <p className="quick-search-label quick-search-quality-label">
        {label || 'Only want books that clear a quality bar? Set your minimum:'}
      </p>
      <div className="quick-search-quality-row">
        <div className="quick-search-quality-wrap">
          <select
            className="quick-search-select quick-search-select-quality"
            value={pendingDimension}
            onChange={(e) => {
              setPendingDimension(e.target.value);
              setPendingTier('');
            }}
            aria-label="Quality dimension"
          >
            {QUALITY_DIMENSION_OPTIONS.map((dim) => (
              <option key={dim.key} value={dim.key}>
                {dim.label}
              </option>
            ))}
          </select>
          <select
            className="quick-search-select quick-search-select-quality"
            value={pendingTier}
            onChange={(e) => setPendingTier(e.target.value)}
            aria-label="Minimum tier"
          >
            {TIER_VALUES.map((v) => (
              <option key={v} value={v}>
                {pendingDimension === 'overall' ? OVERALL_TIER_LABELS[v] : v === '' ? 'Any' : `${v}+`}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="quick-search-quality-add"
            onClick={addQualityFilter}
            disabled={!pendingTier}
          >
            Add
          </button>
          <ScoreMethodologyInfo label="" scope="overall" />
        </div>
      </div>

      {value.length > 0 && (
        <div className="quick-search-quality-chips">
          {value.map((f) => (
            <span key={f.dimension} className="quick-search-quality-chip">
              {dimensionLabel(f.dimension)} {f.tier}+
              <button
                type="button"
                onClick={() => removeQualityFilter(f.dimension)}
                aria-label={`Remove ${dimensionLabel(f.dimension)} filter`}
              >
                &times;
              </button>
            </span>
          ))}
          <button type="button" className="quick-search-quality-reset" onClick={() => onChange([])}>
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
