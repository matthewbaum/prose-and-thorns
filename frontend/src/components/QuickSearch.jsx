import React, { useState } from 'react';
import {
  SUBGENRE,
  ROMANCE_TROPES,
  PLOT_TROPES,
  SPICE_LEVELS,
  DARKNESS_LEVELS,
  SERIES_STATUS,
  AGE_CATEGORY,
  PUBLISHER_TYPE,
  SERIES_LENGTH,
  CONTENT_WARNINGS,
} from '../constants/taxonomy.js';
import QualityFilterPicker, { qualityFiltersToPatch } from './QualityFilterPicker.jsx';
import '../styles/QuickSearch.css';

// Subgenre gets its own button rather than folding into Vibe or Trope — it's
// world-concept/creature-type/mood (Gothic, Dragon Riders, Shifters), not a
// narrative trope and not an intensity axis, and deserves its own home
// rather than being mislabeled as either.
const SUBGENRE_GROUPS = [{ label: null, options: SUBGENRE }];

function toggleValue(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// Always mounted rather than conditionally rendered, so closing a panel is
// an animated height collapse (grid-template-rows 1fr -> 0fr) instead of an
// instant unmount — a plain conditional {open && <Panel/>} has nothing to
// transition since the element is gone the instant it closes, which reads
// as "it doesn't collapse, it just vanishes/snaps."
function CategoryPanel({ open, groups, selected, onToggle }) {
  return (
    <div className={`quick-search-panel-collapse${open ? ' expanded' : ''}`}>
      <div className="quick-search-panel-collapse-inner">
        <div className="quick-search-panel">
          {groups.map((g) => (
            <React.Fragment key={g.label || 'ungrouped'}>
              {g.label && <span className="quick-search-panel-label">{g.label}</span>}
              {g.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`quick-search-pill${selected.includes(opt.value) ? ' selected' : ''}`}
                  onClick={() => onToggle(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function QuickSearch({ onSearch }) {
  const [subgenre, setSubgenre] = useState([]);
  const [spice, setSpice] = useState([]);
  const [darkness, setDarkness] = useState([]);
  const [romanceTropes, setRomanceTropes] = useState([]);
  const [plotTropes, setPlotTropes] = useState([]);
  // Multiple dimensions can each carry their own minimum bar at once (e.g.
  // Pacing 4+ AND Romance Quality 3.5+) — mirrors BookPicker's "search, pick,
  // it becomes a chip, search again" pattern rather than a single dropdown
  // that can only ever hold one active filter.
  const [qualityFilters, setQualityFilters] = useState([]); // [{ dimension, tier }]

  // The rest of the filter surface (series status, age category, publisher,
  // series length, content warnings) — everything Subgenre/Vibe/Trope don't
  // cover — lives behind its own toggle rather than a separate page, same
  // interaction as the other three.
  const [seriesStatus, setSeriesStatus] = useState([]);
  const [ageCategory, setAgeCategory] = useState([]);
  const [publisherType, setPublisherType] = useState([]);
  const [seriesLength, setSeriesLength] = useState([]);
  const [avoidWarnings, setAvoidWarnings] = useState([]);

  const [subgenreOpen, setSubgenreOpen] = useState(false);
  const [vibeOpen, setVibeOpen] = useState(false);
  const [tropeOpen, setTropeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const moreCount =
    seriesStatus.length + ageCategory.length + publisherType.length + seriesLength.length + avoidWarnings.length;

  const handleSearch = () => {
    const patch = {};
    if (subgenre.length > 0) patch.subgenre = subgenre;
    if (spice.length > 0) patch.spice_level = spice;
    if (darkness.length > 0) patch.darkness_level = darkness;
    if (romanceTropes.length > 0) patch.romance_tropes = romanceTropes;
    if (plotTropes.length > 0) patch.plot_tropes = plotTropes;
    Object.assign(patch, qualityFiltersToPatch(qualityFilters));
    if (seriesStatus.length > 0) patch.series_status = seriesStatus;
    if (ageCategory.length > 0) patch.age_category = ageCategory;
    if (publisherType.length > 0) patch.publisher_type = publisherType;
    if (seriesLength.length > 0) patch.series_length = seriesLength;
    if (avoidWarnings.length > 0) patch.exclude_warnings = avoidWarnings;
    onSearch(patch);
  };

  return (
    <div className="quick-search-wrap">
      <QualityFilterPicker value={qualityFilters} onChange={setQualityFilters} />

      <p className="quick-search-label">or narrow by subgenre, vibe, trope, and more:</p>
      <div className="quick-search-category-row">
        <button
          type="button"
          className={`quick-search-category-btn${subgenreOpen ? ' open' : ''}`}
          onClick={() => setSubgenreOpen((v) => !v)}
        >
          Subgenre{subgenre.length > 0 ? ` (${subgenre.length})` : ''} <span className="chevron-small">&#9662;</span>
        </button>
        <button
          type="button"
          className={`quick-search-category-btn${vibeOpen ? ' open' : ''}`}
          onClick={() => setVibeOpen((v) => !v)}
        >
          Vibe{spice.length + darkness.length > 0 ? ` (${spice.length + darkness.length})` : ''}{' '}
          <span className="chevron-small">&#9662;</span>
        </button>
        <button
          type="button"
          className={`quick-search-category-btn${tropeOpen ? ' open' : ''}`}
          onClick={() => setTropeOpen((v) => !v)}
        >
          Trope{romanceTropes.length + plotTropes.length > 0 ? ` (${romanceTropes.length + plotTropes.length})` : ''}{' '}
          <span className="chevron-small">&#9662;</span>
        </button>
        <button
          type="button"
          className={`quick-search-category-btn${moreOpen ? ' open' : ''}`}
          onClick={() => setMoreOpen((v) => !v)}
        >
          Browse more filters{moreCount > 0 ? ` (${moreCount})` : ''} <span className="chevron-small">&#9662;</span>
        </button>
        <button type="button" className="quick-search-find-btn" onClick={handleSearch}>
          Find books &rarr;
        </button>
      </div>

      {/* One shared flex child (not four) so quick-search-wrap's gap only
          applies once around this group — otherwise each always-mounted
          collapse wrapper would claim its own 14px gap slot even fully
          collapsed, padding out the layout before anything is opened. */}
      <div className="quick-search-panels">
        <CategoryPanel
          open={subgenreOpen}
          groups={SUBGENRE_GROUPS}
          selected={subgenre}
          onToggle={(v) => setSubgenre(toggleValue(subgenre, v))}
        />
        <CategoryPanel
          open={vibeOpen}
          groups={[
            { label: 'Spice level', options: SPICE_LEVELS },
            { label: 'Darkness level', options: DARKNESS_LEVELS },
          ]}
          selected={[...spice, ...darkness]}
          onToggle={(v) => {
            if (SPICE_LEVELS.some((o) => o.value === v)) setSpice(toggleValue(spice, v));
            else setDarkness(toggleValue(darkness, v));
          }}
        />
        <CategoryPanel
          open={tropeOpen}
          groups={[
            { label: 'Romance tropes', options: ROMANCE_TROPES },
            { label: 'Plot tropes', options: PLOT_TROPES },
          ]}
          selected={[...romanceTropes, ...plotTropes]}
          onToggle={(v) => {
            if (ROMANCE_TROPES.some((o) => o.value === v)) setRomanceTropes(toggleValue(romanceTropes, v));
            else setPlotTropes(toggleValue(plotTropes, v));
          }}
        />
        <CategoryPanel
          open={moreOpen}
          groups={[
            { label: 'Series status', options: SERIES_STATUS.filter((o) => o.value !== 'any') },
            { label: 'Age category', options: AGE_CATEGORY.filter((o) => o.value !== 'any') },
            { label: 'Publisher type', options: PUBLISHER_TYPE.filter((o) => o.value !== 'any') },
            { label: 'Series length', options: SERIES_LENGTH },
            { label: 'Content warnings to avoid', options: CONTENT_WARNINGS },
          ]}
          selected={[...seriesStatus, ...ageCategory, ...publisherType, ...seriesLength, ...avoidWarnings]}
          onToggle={(v) => {
            if (SERIES_STATUS.some((o) => o.value === v)) setSeriesStatus(toggleValue(seriesStatus, v));
            else if (AGE_CATEGORY.some((o) => o.value === v)) setAgeCategory(toggleValue(ageCategory, v));
            else if (PUBLISHER_TYPE.some((o) => o.value === v)) setPublisherType(toggleValue(publisherType, v));
            else if (SERIES_LENGTH.some((o) => o.value === v)) setSeriesLength(toggleValue(seriesLength, v));
            else setAvoidWarnings(toggleValue(avoidWarnings, v));
          }}
        />
      </div>

      <p className="quick-search-label quick-search-hint">
        Search using any combination of quality, subgenre, vibe, trope, or more filters — with or
        without entering books above.
      </p>
    </div>
  );
}
