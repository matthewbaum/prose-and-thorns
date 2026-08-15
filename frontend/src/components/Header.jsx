import React from 'react';
import SiteMenu from './SiteMenu.jsx';
import HeaderSearch from './HeaderSearch.jsx';
import '../styles/Header.css';

export default function Header({ onToggleSidebar, view, onNavigateHome, onNavigateBrowse, onNavigateAbout, onSelectBook }) {
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
        {/* Hidden on Home (redundant with the hero's own "Browse all books"
            button there) and on Browse itself (clicking it while already on
            Browse is a no-op — not worth the confusion of a clickable-looking
            button that does nothing, even styled as "active"). Still shown
            on Recommend/About, where it's the only route back to Browse. */}
        {view !== 'home' && view !== 'browse' && (
          <button type="button" className="nav-link" onClick={onNavigateBrowse}>
            Browse all
          </button>
        )}
        <HeaderSearch onSelectBook={onSelectBook} />
        <SiteMenu onNavigateAbout={onNavigateAbout} aboutActive={view === 'about'} />
      </nav>
    </header>
  );
}
