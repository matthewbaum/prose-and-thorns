const BASE = '/api';

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function fetchBooks(filters) {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      params.set(key, value.join(','));
    } else {
      params.set(key, value);
    }
  });
  const qs = params.toString();
  return request(`/books${qs ? `?${qs}` : ''}`);
}

export function fetchBook(id) {
  return request(`/books/${id}`);
}

export function fetchShelves() {
  return request('/shelves');
}

export function searchBooks(query) {
  return request(`/books/search?q=${encodeURIComponent(query)}`);
}

export function fetchRecommendations(ids, mode = 'any') {
  return request(`/recommendations?ids=${ids.join(',')}&mode=${mode}`);
}
