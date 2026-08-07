import React, { useEffect, useRef, useState } from 'react';
import CollapsibleSection from './CollapsibleSection.jsx';

export default function RadioFilterSection({
  title,
  options,
  selected,
  defaultValue,
  onSelect,
  defaultOpen = true,
}) {
  const isDefault = selected === defaultValue;
  const [committed, setCommitted] = useState(!isDefault);
  const prevSelected = useRef(selected);

  useEffect(() => {
    if (!isDefault) {
      setCommitted(true);
    } else if (prevSelected.current !== defaultValue) {
      setCommitted(false);
    }
    prevSelected.current = selected;
  }, [selected, isDefault, defaultValue]);

  const labelFor = (value) => options.find((o) => o.value === value)?.label || value;

  return (
    <CollapsibleSection title={title} defaultOpen={defaultOpen} badge={isDefault ? 0 : 1}>
      {committed && !isDefault ? (
        <div className="filter-summary">
          <div className="filter-summary-chips">
            <span className="filter-chip">
              {labelFor(selected)}
              <button
                type="button"
                className="filter-chip-remove"
                aria-label={`Clear ${labelFor(selected)}`}
                onClick={() => onSelect(defaultValue)}
              >
                &times;
              </button>
            </span>
          </div>
          <button type="button" className="link-btn filter-summary-edit" onClick={() => setCommitted(false)}>
            Edit
          </button>
        </div>
      ) : (
        <div className="radio-list">
          {options.map((opt) => (
            <label key={opt.value} className="radio-item">
              <input
                type="radio"
                name={title}
                checked={selected === opt.value}
                onChange={() => onSelect(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
