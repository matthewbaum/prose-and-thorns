import React, { useEffect, useState } from 'react';
import Shelf from './Shelf.jsx';
import RatingLegend from './RatingLegend.jsx';
import QuickSearch from './QuickSearch.jsx';
import BookPicker from './BookPicker.jsx';
import { fetchShelves } from '../api.js';
import '../styles/HomePage.css';

export default function HomePage({ onSelectBook, onBrowseAll, onQuickSearch, onRecommend }) {
  const [shelves, setShelves] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchShelves()
      .then((data) => {
        if (!cancelled) setShelves(data.shelves || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="home-page">
      <div className="home-hero">
        <h1 className="home-hero-title">Tell us what you&apos;re after. We&apos;ll find the best of it.</h1>
        <p className="home-hero-text">
          Filter by subgenre, spice level, series length, dozens of romance and plot tropes, and
          content warnings — then we rank the books that match what you&apos;re looking for by real
          quality scores (prose, romance, world-building, pacing, emotional payoff, character
          depth), built from actual reader reviews, not a single star rating.
        </p>
        <button className="browse-all-btn" onClick={onBrowseAll}>
          Browse all books
        </button>
      </div>

      <p className="quick-search-label">Looking for something specific? Start here:</p>
      <QuickSearch onSearch={onQuickSearch} />

      <p className="quick-search-label">Or tell us a few books you already love:</p>
      <BookPicker onRecommend={onRecommend} />

      {loading ? (
        <p className="home-loading">Loading shelves&hellip;</p>
      ) : (
        <>
          {shelves.length > 0 && <RatingLegend />}
          {shelves.map((shelf) => (
            <Shelf key={shelf.key} title={shelf.title} books={shelf.books} onSelect={onSelectBook} />
          ))}
        </>
      )}
    </div>
  );
}
