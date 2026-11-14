// Thin fetch wrapper. Every request carries the custom header the server requires for CSRF protection.
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(method, url, body) {
  const opts = { method, headers: { 'X-Requested-With': 'KuwaitGreen' }, credentials: 'same-origin' };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  let res;
  try { res = await fetch(url, opts); } catch { throw new ApiError(0, 'offline'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  me: () => request('GET', '/api/auth/me'),
  login: (username, password) => request('POST', '/api/auth/login', { username, password }),
  register: (username, password, displayName) => request('POST', '/api/auth/register', { username, password, displayName }),
  logout: () => request('POST', '/api/auth/logout'),
  zones: () => request('GET', '/api/zones'),
  species: () => request('GET', '/api/species'),
  stats: () => request('GET', '/api/stats'),
  plants: ({ zone, before, limit } = {}) => {
    const p = new URLSearchParams();
    if (zone) p.set('zone', zone);
    if (before) p.set('before', before);
    if (limit) p.set('limit', limit);
    return request('GET', `/api/plants?${p}`);
  },
  myPlants: () => request('GET', '/api/plants/mine'),
  createPlant: (formData) => request('POST', '/api/plants', formData),
  deletePlant: (id) => request('DELETE', `/api/plants/${encodeURIComponent(id)}`),
  reportPlant: (id, reason) => request('POST', `/api/plants/${encodeURIComponent(id)}/report`, { reason }),
};
