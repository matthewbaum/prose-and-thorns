import React from 'react';
import BookCard from './BookCard.jsx';
import RatingLegend from './RatingLegend.jsx';
import '../styles/BookGrid.css';

export default function BookGrid({
  books,
  loading,
  onSelect,
  filters,
  matchLabel,
  emptyTitle = 'No books match these filters yet.',
  emptySub = 'Try loosening a filter or two.',
}) {
  if (loading) {
    return (
      <div className="book-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="book-card-skeleton" />
        ))}
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <div className="empty-state">
        <p>{emptyTitle}</p>
        <p className="empty-state-sub">{emptySub}</p>
      </div>
    );
  }

  return (
    <>
      <RatingLegend />
      <div className="book-grid">
        {books.map((book) => (
          <BookCard key={book.id} book={book} onSelect={onSelect} filters={filters} matchLabel={matchLabel} />
        ))}
      </div>
    </>
  );
}
