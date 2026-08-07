import React from 'react';
import BookCard from './BookCard.jsx';
import '../styles/Shelf.css';

export default function Shelf({ title, books, onSelect }) {
  if (!books || books.length === 0) return null;

  return (
    <section className="shelf">
      <h2 className="shelf-title">{title}</h2>
      <div className="shelf-row">
        {books.map((book) => (
          <div className="shelf-card" key={book.id}>
            <BookCard book={book} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </section>
  );
}
