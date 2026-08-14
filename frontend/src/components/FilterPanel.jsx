import React from 'react';
import CollapsibleSection from './CollapsibleSection.jsx';
import CheckboxFilterSection from './CheckboxFilterSection.jsx';
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
  DARKNESS_LEVELS,
  MIN_QUALITY_FILTERS,
  CONTENT_WARNINGS,
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

        <CollapsibleSection
          title="Minimum Quality Score"
          defaultOpen={false}
          className="filter-section-quality"
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
          title="Series Status"
          defaultOpen={false}
          options={SERIES_STATUS.filter((opt) => opt.value !== 'any')}
          selected={filters.series_status}
          onToggle={(value) =>
            onChange({ series_status: toggleValue(filters.series_status, value) })
          }
        />

        <CheckboxFilterSection
          title="Age Category"
          defaultOpen={false}
          options={AGE_CATEGORY.filter((opt) => opt.value !== 'any')}
          selected={filters.age_category}
          onToggle={(value) =>
            onChange({ age_category: toggleValue(filters.age_category, value) })
          }
        />

        <CheckboxFilterSection
          title="Publisher Type"
          defaultOpen={false}
          options={PUBLISHER_TYPE.filter((opt) => opt.value !== 'any')}
          selected={filters.publisher_type}
          onToggle={(value) =>
            onChange({ publisher_type: toggleValue(filters.publisher_type, value) })
          }
        />

        <CheckboxFilterSection
          title="Series Length"
          defaultOpen={false}
          options={SERIES_LENGTH}
          selected={filters.series_length}
          onToggle={(value) =>
            onChange({ series_length: toggleValue(filters.series_length, value) })
          }
        />

        <CheckboxFilterSection
          title="Subgenre"
          defaultOpen={false}
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

        <CheckboxFilterSection
          title="Spice Level"
          defaultOpen={false}
          options={SPICE_LEVELS}
          selected={filters.spice_level}
          onToggle={(value) => onChange({ spice_level: toggleValue(filters.spice_level, value) })}
        />

        <CheckboxFilterSection
          title="Darkness Level"
          defaultOpen={false}
          options={DARKNESS_LEVELS}
          selected={filters.darkness_level}
          onToggle={(value) => onChange({ darkness_level: toggleValue(filters.darkness_level, value) })}
          description="How intense the content is (violence, trauma, tone) — separate from genre labels like “Dark Fantasy” or “Dark Romance” above."
        />

        <CheckboxFilterSection
          title="Content Warnings — Exclude"
          defaultOpen={false}
          options={CONTENT_WARNINGS}
          selected={filters.exclude_warnings}
          onToggle={(value) =>
            onChange({ exclude_warnings: toggleValue(filters.exclude_warnings, value) })
          }
        />

      </aside>
    </>
  );
}
