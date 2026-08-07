import React from 'react';
import CollapsibleSection from './CollapsibleSection.jsx';
import CheckboxFilterSection from './CheckboxFilterSection.jsx';
import RadioFilterSection from './RadioFilterSection.jsx';
import ScoreMethodologyInfo from './ScoreMethodologyInfo.jsx';
import {
  SERIES_STATUS,
  AGE_CATEGORY,
  PUBLISHER_TYPE,
  SERIES_LENGTH,
  SUBGENRE,
  ROMANCE_TROPES,
  PLOT_TROPES,
  SPICE_LEVELS,
  MIN_QUALITY_FILTERS,
  CONTENT_WARNINGS,
  SORT_OPTIONS,
} from '../constants/taxonomy.js';
import '../styles/FilterPanel.css';

function toggleValue(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function FilterPanel({ filters, onChange, onReset, open, onClose }) {
  return (
    <>
      {open && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={`filter-panel ${open ? 'open' : ''}`}>
        <div className="filter-panel-header">
          <h2>Filters</h2>
          <div className="filter-panel-actions">
            <button className="link-btn" onClick={onReset}>
              Reset
            </button>
            <button className="close-btn" onClick={onClose} aria-label="Close filters">
              &times;
            </button>
          </div>
        </div>

        <RadioFilterSection
          title="Series Status"
          options={SERIES_STATUS}
          selected={filters.series_status}
          defaultValue="any"
          onSelect={(value) => onChange({ series_status: value })}
        />

        <RadioFilterSection
          title="Age Category"
          options={AGE_CATEGORY}
          selected={filters.age_category}
          defaultValue="any"
          onSelect={(value) => onChange({ age_category: value })}
        />

        <RadioFilterSection
          title="Publisher Type"
          options={PUBLISHER_TYPE}
          selected={filters.publisher_type}
          defaultValue="any"
          onSelect={(value) => onChange({ publisher_type: value })}
        />

        <CheckboxFilterSection
          title="Series Length"
          options={SERIES_LENGTH}
          selected={filters.series_length}
          onToggle={(value) =>
            onChange({ series_length: toggleValue(filters.series_length, value) })
          }
        />

        <CheckboxFilterSection
          title="Subgenre"
          options={SUBGENRE}
          selected={filters.subgenre}
          onToggle={(value) => onChange({ subgenre: toggleValue(filters.subgenre, value) })}
        />

        <CheckboxFilterSection
          title="Romance Tropes"
          defaultOpen={false}
          options={ROMANCE_TROPES}
          selected={filters.romance_tropes}
          onToggle={(value) =>
            onChange({ romance_tropes: toggleValue(filters.romance_tropes, value) })
          }
        />

        <CheckboxFilterSection
          title="Plot Tropes"
          defaultOpen={false}
          options={PLOT_TROPES}
          selected={filters.plot_tropes}
          onToggle={(value) =>
            onChange({ plot_tropes: toggleValue(filters.plot_tropes, value) })
          }
        />

        <RadioFilterSection
          title="Spice Level"
          options={[{ value: '', label: 'Any' }, ...SPICE_LEVELS]}
          selected={filters.spice_min || ''}
          defaultValue=""
          onSelect={(value) => onChange({ spice_min: value, spice_max: value })}
        />

        <CollapsibleSection
          title="Minimum Quality Score"
          defaultOpen={false}
          headerExtra={<ScoreMethodologyInfo label="" />}
        >
          <div className="slider-list">
            {MIN_QUALITY_FILTERS.map((f) => {
              // Per-dimension scores are stored as whole numbers only (Claude's
              // synthesis never outputs a fractional dimension score) — finer
              // steps there would just be fake precision. Overall is a genuine
              // average of six of those integers, so it's meaningfully fractional.
              const step = f.key === 'min_overall' ? 0.1 : 1;
              return (
                <div key={f.key} className="slider-item">
                  <div className="slider-label">
                    <span>{f.label}</span>
                    <span className="slider-value">{filters[f.key].toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step={step}
                    value={filters[f.key]}
                    onChange={(e) => onChange({ [f.key]: Number(e.target.value) })}
                  />
                </div>
              );
            })}
          </div>
        </CollapsibleSection>

        <CheckboxFilterSection
          title="Content Warnings — Exclude"
          defaultOpen={false}
          options={CONTENT_WARNINGS}
          selected={filters.exclude_warnings}
          onToggle={(value) =>
            onChange({ exclude_warnings: toggleValue(filters.exclude_warnings, value) })
          }
        />

        <div className="filter-section">
          <label className="sort-label" htmlFor="sort-select">
            Sort Results By
          </label>
          <select
            id="sort-select"
            className="sort-select"
            value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value })}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </aside>
    </>
  );
}
