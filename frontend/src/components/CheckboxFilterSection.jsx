import React, { useEffect, useRef, useState } from 'react';
import CollapsibleSection from './CollapsibleSection.jsx';

export default function CheckboxFilterSection({
  title,
  options,
  selected,
  onToggle,
  defaultOpen = true,
  description,
}) {
  const [committed, setCommitted] = useState(selected.length > 0);
  const prevCount = useRef(selected.length);

  useEffect(() => {
    if (prevCount.current > 0 && selected.length === 0) {
      setCommitted(false);
    }
    prevCount.current = selected.length;
  }, [selected.length]);

  const labelFor = (value) => options.find((o) => o.value === value)?.label || value;

  return (
    <CollapsibleSection title={title} defaultOpen={defaultOpen} badge={selected.length}>
      {committed && selected.length > 0 ? (
        <div className="filter-summary">
          <div className="filter-summary-chips">
            {selected.map((value) => (
              <span key={value} className="filter-chip">
                {labelFor(value)}
                <button
                  type="button"
                  className="filter-chip-remove"
                  aria-label={`Remove ${labelFor(value)}`}
                  onClick={() => onToggle(value)}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
          <button type="button" className="link-btn filter-summary-edit" onClick={() => setCommitted(false)}>
            Edit
          </button>
        </div>
      ) : (
        <>
          {description && <p className="filter-section-description">{description}</p>}
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
          {selected.length > 0 && (
            <button type="button" className="filter-done-btn" onClick={() => setCommitted(true)}>
              Done
            </button>
          )}
        </>
      )}
    </CollapsibleSection>
  );
}
