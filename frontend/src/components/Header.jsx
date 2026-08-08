import React from 'react';
import '../styles/Header.css';

export default function Header({ onToggleSidebar, resultCount, view, onNavigateHome, onNavigateBrowse, onNavigateAbout }) {
  return (
    <header className="site-header">
      {view === 'browse' && (
        <button
          className="sidebar-toggle"
          onClick={onToggleSidebar}
          aria-label="Toggle filters"
        >
          <span />
          <span />
          <span />
        </button>
      )}

      <button className="wordmark" onClick={onNavigateHome} type="button">
        <img className="logo-mark" src="/rose-logo.svg" alt="" aria-hidden="true" />
        <span className="wordmark-text">
          <h1>Prose &amp; Thorns</h1>
          <p className="tagline">Find romantasy worth reading.</p>
        </span>
      </button>

      <nav className="header-nav">
        <button
          type="button"
          className={`nav-link ${view === 'browse' ? 'active' : ''}`}
          onClick={onNavigateBrowse}
        >
          Browse all
        </button>
        <button
          type="button"
          className={`nav-link ${view === 'about' ? 'active' : ''}`}
          onClick={onNavigateAbout}
        >
          About
        </button>
      </nav>

      {view === 'browse' && (
        <div className="result-count">
          {resultCount > 0 ? `${resultCount} book${resultCount === 1 ? '' : 's'}` : ''}
        </div>
      )}
    </header>
  );
}
