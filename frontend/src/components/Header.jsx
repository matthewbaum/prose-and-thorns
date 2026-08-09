import React from 'react';
import SiteMenu from './SiteMenu.jsx';
import '../styles/Header.css';

export default function Header({ onToggleSidebar, view, onNavigateHome, onNavigateBrowse, onNavigateAbout }) {
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
        {/* Redundant with the hero's own "Browse all books" button on Home
            — hidden there, but this is the only route back to Browse from
            Recommend/About, so it stays everywhere else. */}
        {view !== 'home' && (
          <button
            type="button"
            className={`nav-link ${view === 'browse' ? 'active' : ''}`}
            onClick={onNavigateBrowse}
          >
            Browse all
          </button>
        )}
        <SiteMenu onNavigateAbout={onNavigateAbout} aboutActive={view === 'about'} />
      </nav>
    </header>
  );
}
