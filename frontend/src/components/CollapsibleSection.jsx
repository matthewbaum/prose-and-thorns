import React, { useState } from 'react';

export default function CollapsibleSection({ title, defaultOpen = true, headerExtra, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="filter-section">
      <div className="filter-section-header-row">
        <button
          type="button"
          className="filter-section-header"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span>{title}</span>
          <span className={`chevron ${open ? 'open' : ''}`} aria-hidden="true">
            &#9662;
          </span>
        </button>
        {headerExtra}
      </div>
      {open && <div className="filter-section-body">{children}</div>}
    </div>
  );
}
