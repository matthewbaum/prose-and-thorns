import React from 'react';
import BookCard from './BookCard.jsx';
import '../styles/BookGrid.css';

export default function BookGrid({ books, loading, onSelect }) {
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
        <p>No books match these filters yet.</p>
        <p className="empty-state-sub">Try loosening a filter or two.</p>
      </div>
    );
  }

  return (
    <div className="book-grid">
      {books.map((book) => (
        <BookCard key={book.id} book={book} onSelect={onSelect} />
      ))}
    </div>
  );
}
