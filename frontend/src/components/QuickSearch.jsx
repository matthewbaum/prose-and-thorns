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
  DARKNESS_LEVELS,
  CONTENT_WARNINGS,
} from '../constants/taxonomy.js';
import ScoreMethodologyInfo from './ScoreMethodologyInfo.jsx';
import MultiSelectDropdown from './MultiSelectDropdown.jsx';
import '../styles/QuickSearch.css';

const QUALITY_OPTIONS = [
  { value: '', label: 'Any quality' },
  { value: '3', label: '3+ (Solid across the board)' },
  { value: '3.5', label: '3.5+ (Strong across the board)' },
  { value: '4', label: '4+ (Excellent across the board)' },
  { value: '4.5', label: '4.5+ (Rare — exceptional)' },
];

export default function QuickSearch({ onSearch }) {
  const [seriesStatus, setSeriesStatus] = useState([]);
  const [ageCategory, setAgeCategory] = useState([]);
  const [publisherType, setPublisherType] = useState([]);
  const [seriesLength, setSeriesLength] = useState('');
  const [subgenre, setSubgenre] = useState([]);
  const [romanceTropes, setRomanceTropes] = useState([]);
  const [plotTropes, setPlotTropes] = useState([]);
  const [spice, setSpice] = useState([]);
  const [darkness, setDarkness] = useState([]);
  const [avoidWarnings, setAvoidWarnings] = useState([]);
  const [quality, setQuality] = useState('');

  const handleSearch = () => {
    const patch = {};
    if (seriesStatus.length > 0) patch.series_status = seriesStatus;
    if (ageCategory.length > 0) patch.age_category = ageCategory;
    if (publisherType.length > 0) patch.publisher_type = publisherType;
    if (seriesLength) patch.series_length = [seriesLength];
    if (subgenre.length > 0) patch.subgenre = subgenre;
    if (romanceTropes.length > 0) patch.romance_tropes = romanceTropes;
    if (plotTropes.length > 0) patch.plot_tropes = plotTropes;
    if (spice.length > 0) patch.spice_level = spice;
    if (darkness.length > 0) patch.darkness_level = darkness;
    if (avoidWarnings.length > 0) patch.exclude_warnings = avoidWarnings;
    if (quality) patch.min_overall = Number(quality);
    onSearch(patch);
  };

  const hasSelection =
    seriesStatus.length > 0 ||
    ageCategory.length > 0 ||
    publisherType.length > 0 ||
    seriesLength ||
    subgenre.length > 0 ||
    romanceTropes.length > 0 ||
    plotTropes.length > 0 ||
    spice.length > 0 ||
    darkness.length > 0 ||
    avoidWarnings.length > 0 ||
    quality;

  return (
    <div className="quick-search">
      <MultiSelectDropdown
        options={SERIES_STATUS.filter((opt) => opt.value !== 'any')}
        selected={seriesStatus}
        onChange={setSeriesStatus}
        placeholder="Any series status"
        ariaLabel="Series status"
      />

      <MultiSelectDropdown
        options={AGE_CATEGORY.filter((opt) => opt.value !== 'any')}
        selected={ageCategory}
        onChange={setAgeCategory}
        placeholder="Any age category"
        ariaLabel="Age category"
      />

      <MultiSelectDropdown
        options={PUBLISHER_TYPE.filter((opt) => opt.value !== 'any')}
        selected={publisherType}
        onChange={setPublisherType}
        placeholder="Any publisher type"
        ariaLabel="Publisher type"
      />

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

      <MultiSelectDropdown
        options={SUBGENRE}
        selected={subgenre}
        onChange={setSubgenre}
        placeholder="Any subgenre"
        ariaLabel="Subgenre"
      />

      <MultiSelectDropdown
        options={ROMANCE_TROPES}
        selected={romanceTropes}
        onChange={setRomanceTropes}
        placeholder="Any romance trope"
        ariaLabel="Romance trope"
      />

      <MultiSelectDropdown
        options={PLOT_TROPES}
        selected={plotTropes}
        onChange={setPlotTropes}
        placeholder="Any plot trope"
        ariaLabel="Plot trope"
      />

      <MultiSelectDropdown
        options={SPICE_LEVELS}
        selected={spice}
        onChange={setSpice}
        placeholder="Any spice"
        ariaLabel="Spice level"
      />

      <MultiSelectDropdown
        options={DARKNESS_LEVELS}
        selected={darkness}
        onChange={setDarkness}
        placeholder="Any darkness level"
        ariaLabel="Darkness level"
      />

      <MultiSelectDropdown
        options={CONTENT_WARNINGS}
        selected={avoidWarnings}
        onChange={setAvoidWarnings}
        placeholder="Nothing to avoid"
        prefixLabel="Avoid: "
        ariaLabel="Content warnings to avoid"
      />

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
        <ScoreMethodologyInfo label="" scope="overall" />
      </div>

      <button type="button" className="quick-search-btn" onClick={handleSearch} disabled={!hasSelection}>
        Find books
      </button>
    </div>
  );
}
