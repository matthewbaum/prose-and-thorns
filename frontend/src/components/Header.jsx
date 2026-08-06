import React from 'react';
import '../styles/Header.css';

export default function Header({ onToggleSidebar, resultCount }) {
  return (
    <header className="site-header">
      <button
        className="sidebar-toggle"
        onClick={onToggleSidebar}
        aria-label="Toggle filters"
      >
        <span />
        <span />
        <span />
      </button>

      <div className="wordmark">
        <h1>
          Prose <span className="thorn-divider" aria-hidden="true">&#10047;</span> Thorns
        </h1>
        <p className="tagline">Find romantasy worth reading.</p>
      </div>

      <div className="result-count">
        {resultCount > 0 ? `${resultCount} book${resultCount === 1 ? '' : 's'}` : ''}
      </div>
    </header>
  );
}
