import { log } from './util.js';

const API_BASE = 'https://www.googleapis.com/books/v1/volumes';

// Google Books rarely returns structured series info, but many volumes encode
// it in the title, e.g. "Fourth Wing (The Empyrean, #1)". Parse that pattern
// as a best-effort fallback for Step 5 (series metadata).
function parseSeriesFromTitle(title) {
  const match = title.match(/\(([^,()]+),\s*#(\d+)\)/);
  if (!match) return { seriesName: null, seriesPosition: null };
  return { seriesName: match[1].trim(), seriesPosition: Number(match[2]) };
}

export async function fetchGoogleBooksData(title, author) {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_BOOKS_API_KEY is not set');
  }

  const q = `intitle:${title} inauthor:${author}`;
  const url = `${API_BASE}?q=${encodeURIComponent(q)}&maxResults=5&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Books API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) {
    log(`No Google Books match for "${title}" by ${author}`);
    return null;
  }

  const info = item.volumeInfo || {};
  const saleInfo = item.saleInfo || {};
  const images = info.imageLinks || {};
  const coverUrl =
    images.extraLarge || images.large || images.medium || images.small || images.thumbnail || null;

  const { seriesName, seriesPosition } = parseSeriesFromTitle(info.title || title);

  const editorialReview =
    (item.searchInfo && item.searchInfo.textSnippet) ||
    (info.description && info.description.length > 300 ? null : null);

  return {
    google_books_id: item.id,
    title: (info.title || title).replace(/\s*\([^)]*#\d+\)\s*$/, '').trim(),
    author: (info.authors || [author]).join(', '),
    publisher: info.publisher || null,
    publication_date: info.publishedDate || null,
    page_count: info.pageCount || null,
    description: info.description || '',
    cover_url: coverUrl ? coverUrl.replace('http://', 'https://') : null,
    google_books_link: info.infoLink || saleInfo.buyLink || null,
    avg_rating: info.averageRating ?? null,
    ratings_count: info.ratingsCount ?? null,
    editorial_review: editorialReview,
    series_name: seriesName,
    series_position: seriesPosition,
  };
}
