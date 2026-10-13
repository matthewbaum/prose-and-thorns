import { qualityFiltersToPatch } from './components/QualityFilterPicker.jsx';

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

export function fetchRecommendations(ids, mode = 'any', sort = 'match', qualityFilters = []) {
  const params = new URLSearchParams({ ids: ids.join(','), mode, sort });
  Object.entries(qualityFiltersToPatch(qualityFilters)).forEach(([key, value]) => params.set(key, value));
  return request(`/recommendations?${params.toString()}`);
}

export function submitInquiry(data) {
  return request('/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// Fire-and-forget -- the retailer link already opens in a new tab via
// target="_blank", so the current page never navigates away and a normal
// fetch (no sendBeacon/keepalive) has time to complete. Bypasses the
// request() helper above since it always calls res.json(), which throws on
// this endpoint's empty 204 response. Never throws itself: a failed click
// log shouldn't be visible to the reader or block the link.
export function logRetailerClick(bookId, retailer) {
  fetch(`${BASE}/books/${bookId}/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ retailer }),
  }).catch(() => {});
}

// Page-view tracking (see backend/src/routes/track.js). The session id is a
// random string kept in sessionStorage -- it lasts until the tab closes and
// isn't linked to anything about the person -- so the admin page can count
// visits as well as views. Fire-and-forget; never throws or blocks the UI.
function trackingSessionId() {
  try {
    let id = sessionStorage.getItem('pt_session');
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 64);
      sessionStorage.setItem('pt_session', id);
    }
    return id;
  } catch {
    return null;
  }
}

export function trackView(payload) {
  const sessionId = trackingSessionId();
  if (!sessionId) return;
  fetch(`${BASE}/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, sessionId }),
  }).catch(() => {});
}
