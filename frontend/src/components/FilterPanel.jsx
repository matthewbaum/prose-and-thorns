import React from 'react';
import CollapsibleSection from './CollapsibleSection.jsx';
import ScoreMethodologyInfo from './ScoreMethodologyInfo.jsx';
import {
  SERIES_STATUS,
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

function CheckboxList({ options, selected, onToggle }) {
  return (
    <div className="checkbox-list">
      {options.map((opt) => (
        <label key={opt.value} className="checkbox-item">
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => onToggle(opt.value)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
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

        <CollapsibleSection title="Series Status">
          <div className="radio-list">
            {SERIES_STATUS.map((opt) => (
              <label key={opt.value} className="radio-item">
                <input
                  type="radio"
                  name="series_status"
                  checked={filters.series_status === opt.value}
                  onChange={() => onChange({ series_status: opt.value })}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Series Length">
          <CheckboxList
            options={SERIES_LENGTH}
            selected={filters.series_length}
            onToggle={(value) =>
              onChange({ series_length: toggleValue(filters.series_length, value) })
            }
          />
        </CollapsibleSection>

        <CollapsibleSection title="Subgenre">
          <CheckboxList
            options={SUBGENRE}
            selected={filters.subgenre}
            onToggle={(value) => onChange({ subgenre: toggleValue(filters.subgenre, value) })}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Romance Tropes" defaultOpen={false}>
          <CheckboxList
            options={ROMANCE_TROPES}
            selected={filters.romance_tropes}
            onToggle={(value) =>
              onChange({ romance_tropes: toggleValue(filters.romance_tropes, value) })
            }
          />
        </CollapsibleSection>

        <CollapsibleSection title="Plot Tropes" defaultOpen={false}>
          <CheckboxList
            options={PLOT_TROPES}
            selected={filters.plot_tropes}
            onToggle={(value) =>
              onChange({ plot_tropes: toggleValue(filters.plot_tropes, value) })
            }
          />
        </CollapsibleSection>

        <CollapsibleSection title="Spice Level">
          <div className="radio-list">
            <label className="radio-item">
              <input
                type="radio"
                name="spice"
                checked={!filters.spice_min}
                onChange={() => onChange({ spice_min: '', spice_max: '' })}
              />
              <span>Any</span>
            </label>
            {SPICE_LEVELS.map((opt) => (
              <label key={opt.value} className="radio-item">
                <input
                  type="radio"
                  name="spice"
                  checked={filters.spice_min === opt.value}
                  onChange={() => onChange({ spice_min: opt.value, spice_max: opt.value })}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Minimum Quality Score"
          defaultOpen={false}
          headerExtra={<ScoreMethodologyInfo label="" />}
        >
          <div className="slider-list">
            {MIN_QUALITY_FILTERS.map((f) => (
              <div key={f.key} className="slider-item">
                <div className="slider-label">
                  <span>{f.label}</span>
                  <span className="slider-value">{filters[f.key]}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={filters[f.key]}
                  onChange={(e) => onChange({ [f.key]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Content Warnings — Exclude" defaultOpen={false}>
          <CheckboxList
            options={CONTENT_WARNINGS}
            selected={filters.exclude_warnings}
            onToggle={(value) =>
              onChange({ exclude_warnings: toggleValue(filters.exclude_warnings, value) })
            }
          />
        </CollapsibleSection>

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
