import React, { useState } from 'react';
import {
  SERIES_STATUS,
  AGE_CATEGORY,
  PUBLISHER_TYPE,
  SERIES_LENGTH,
  SUBGENRE,
  ROMANCE_TROPES,
  PLOT_TROPES,
  SPICE_LEVELS,
  CONTENT_WARNINGS,
} from '../constants/taxonomy.js';
import ScoreMethodologyInfo from './ScoreMethodologyInfo.jsx';
import '../styles/QuickSearch.css';

const QUALITY_OPTIONS = [
  { value: '', label: 'Any quality' },
  { value: '3', label: '3+ (Solid across the board)' },
  { value: '3.5', label: '3.5+ (Strong across the board)' },
  { value: '4', label: '4+ (Excellent across the board)' },
  { value: '4.5', label: '4.5+ (Rare — near flawless)' },
];

export default function QuickSearch({ onSearch }) {
  const [seriesStatus, setSeriesStatus] = useState('');
  const [ageCategory, setAgeCategory] = useState('');
  const [publisherType, setPublisherType] = useState('');
  const [seriesLength, setSeriesLength] = useState('');
  const [subgenre, setSubgenre] = useState('');
  const [romanceTrope, setRomanceTrope] = useState('');
  const [plotTrope, setPlotTrope] = useState('');
  const [spice, setSpice] = useState('');
  const [avoidWarning, setAvoidWarning] = useState('');
  const [quality, setQuality] = useState('');

  const handleSearch = () => {
    const patch = {};
    if (seriesStatus) patch.series_status = seriesStatus;
    if (ageCategory) patch.age_category = ageCategory;
    if (publisherType) patch.publisher_type = publisherType;
    if (seriesLength) patch.series_length = [seriesLength];
    if (subgenre) patch.subgenre = [subgenre];
    if (romanceTrope) patch.romance_tropes = [romanceTrope];
    if (plotTrope) patch.plot_tropes = [plotTrope];
    if (spice) {
      patch.spice_min = spice;
      patch.spice_max = spice;
    }
    if (avoidWarning) patch.exclude_warnings = [avoidWarning];
    if (quality) patch.min_overall = Number(quality);
    onSearch(patch);
  };

  const hasSelection =
    seriesStatus ||
    ageCategory ||
    publisherType ||
    seriesLength ||
    subgenre ||
    romanceTrope ||
    plotTrope ||
    spice ||
    avoidWarning ||
    quality;

  return (
    <div className="quick-search">
      <select
        className="quick-search-select"
        value={seriesStatus}
        onChange={(e) => setSeriesStatus(e.target.value)}
        aria-label="Series status"
      >
        <option value="">Any series status</option>
        {SERIES_STATUS.filter((opt) => opt.value !== 'any').map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        className="quick-search-select"
        value={ageCategory}
        onChange={(e) => setAgeCategory(e.target.value)}
        aria-label="Age category"
      >
        <option value="">Any age category</option>
        {AGE_CATEGORY.filter((opt) => opt.value !== 'any').map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        className="quick-search-select"
        value={publisherType}
        onChange={(e) => setPublisherType(e.target.value)}
        aria-label="Publisher type"
      >
        <option value="">Any publisher type</option>
        {PUBLISHER_TYPE.filter((opt) => opt.value !== 'any').map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        className="quick-search-select"
        value={seriesLength}
        onChange={(e) => setSeriesLength(e.target.value)}
        aria-label="Series length"
      >
        <option value="">Any series length</option>
        {SERIES_LENGTH.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        className="quick-search-select"
        value={subgenre}
        onChange={(e) => setSubgenre(e.target.value)}
        aria-label="Subgenre"
      >
        <option value="">Any subgenre</option>
        {SUBGENRE.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        className="quick-search-select"
        value={romanceTrope}
        onChange={(e) => setRomanceTrope(e.target.value)}
        aria-label="Romance trope"
      >
        <option value="">Any romance trope</option>
        {ROMANCE_TROPES.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        className="quick-search-select"
        value={plotTrope}
        onChange={(e) => setPlotTrope(e.target.value)}
        aria-label="Plot trope"
      >
        <option value="">Any plot trope</option>
        {PLOT_TROPES.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        className="quick-search-select"
        value={spice}
        onChange={(e) => setSpice(e.target.value)}
        aria-label="Spice level"
      >
        <option value="">Any spice</option>
        {SPICE_LEVELS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        className="quick-search-select"
        value={avoidWarning}
        onChange={(e) => setAvoidWarning(e.target.value)}
        aria-label="Content warning to avoid"
      >
        <option value="">Nothing to avoid</option>
        {CONTENT_WARNINGS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            Avoid: {opt.label}
          </option>
        ))}
      </select>

      <div className="quick-search-quality-wrap">
        <select
          className="quick-search-select quick-search-select-quality"
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          aria-label="Minimum quality"
        >
          {QUALITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ScoreMethodologyInfo label="" />
      </div>

      <button type="button" className="quick-search-btn" onClick={handleSearch} disabled={!hasSelection}>
        Find books
      </button>
    </div>
  );
}
