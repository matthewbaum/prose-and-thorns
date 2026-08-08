import React, { useEffect, useRef, useState } from 'react';
import '../styles/MultiSelectDropdown.css';

// Compact checkbox-list dropdown for Quick Search fields where a book can
// genuinely match several values at once (subgenre, tropes, warnings) —
// mirrors the Filter Panel's checkbox sections, just collapsed into a
// dropdown to keep Quick Search's one-row layout.
export default function MultiSelectDropdown({ options, selected, onChange, placeholder, ariaLabel, prefixLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toggleValue = (value) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  let label = placeholder;
  if (selected.length === 1) {
    const opt = options.find((o) => o.value === selected[0]);
    label = prefixLabel ? `${prefixLabel}${opt?.label || selected[0]}` : opt?.label || selected[0];
  } else if (selected.length > 1) {
    label = `${selected.length} selected`;
  }

  return (
    <div className="multi-select-dropdown" ref={ref}>
      <button
        type="button"
        className={`multi-select-trigger ${selected.length > 0 ? 'has-selection' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        <span className="multi-select-trigger-label">{label}</span>
        <span className="multi-select-caret" aria-hidden="true">
          &#9662;
        </span>
      </button>
      {open && (
        <div className="multi-select-panel" role="listbox" aria-label={ariaLabel}>
          {options.map((opt) => (
            <label key={opt.value} className="multi-select-option">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggleValue(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
