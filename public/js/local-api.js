// In-browser demo mode: the same API as the server, stored in this browser's IndexedDB.
// Used automatically when the app is hosted without its server (e.g. on GitHub Pages),
// so anyone can open a link and try every feature with nothing to install.
import { ApiError } from './api.js';
import { zoneAt } from './map.js';

const DB_NAME = 'kuwait-green-demo-v2';
const AR_ERRORS = {
  'Could not load the map': 'تعذّر تحميل الخريطة', 'Could not load plant list': 'تعذّر تحميل قائمة النباتات',
  'Username must be 3–24 letters, numbers or underscores': 'اسم المستخدم يجب أن يكون ٣–٢٤ حرفًا إنجليزيًا أو رقمًا أو _',
  'Password must be at least 8 characters': 'كلمة المرور يجب أن تكون ٨ أحرف على الأقل', 'That username is taken': 'اسم المستخدم مستخدم من قبل',
  'Wrong username or password': 'اسم المستخدم أو كلمة المرور غير صحيحة', 'Please sign in first': 'سجّل الدخول أولًا',
  'Please add a photo of your plant': 'أضف صورة لنبتتك من فضلك', 'Photo is too large (max 6 MB)': 'الصورة كبيرة جدًا (الحد ٦ ميغابايت)',
  'Unknown plant type': 'نوع نبتة غير معروف', 'Invalid location': 'موقع غير صالح',
  'That location is outside Kuwait\'s mapped areas. Pick a spot on land inside Kuwait.': 'هذا الموقع خارج مناطق الكويت. اختر مكانًا على اليابسة داخل الكويت.',
  'Plant not found': 'النبتة غير موجودة', 'Only the grower can update this journey': 'فقط صاحب الرحلة يمكنه تحديثها', 'You can only remove your own plants': 'يمكنك حذف نباتاتك فقط', 'You can\'t report your own plant': 'لا يمكنك الإبلاغ عن نبتتك',
};
const fail = (status, msg) => {
  const ar = document.documentElement.lang === 'ar';
  let text = ar ? AR_ERRORS[msg] : null;
  if (ar && !text) {
    const m = msg.match(/^(.+) must be at most (\d+) characters$/) || msg.match(/^(.+) is required$/);
    const fields = { Username: 'اسم المستخدم', 'Display name': 'الاسم الظاهر', Nickname: 'الاسم المميز', Note: 'الملاحظة', 'Plant type': 'نوع النبتة' };
    if (m && m[2]) text = `${fields[m[1]] || m[1]} يجب ألا يتجاوز ${m[2]} حرفًا`;
    else if (m) text = `${fields[m[1]] || m[1]} مطلوب`;
  }
  throw new ApiError(status, text || msg);
};
const DAY = 86_400_000;

// ---------- IndexedDB helpers ----------
let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      const users = d.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
      users.createIndex('username', 'usernameLower', { unique: true });
      const plants = d.createObjectStore('plants', { keyPath: 'id', autoIncrement: true });
      plants.createIndex('user', 'userId');
      d.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
const wrap = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
async function store(name, mode = 'readonly') { return (await db()).transaction(name, mode).objectStore(name); }
const getAll = async (name) => wrap((await store(name)).getAll());
const get = async (name, key) => wrap((await store(name)).get(key));
const put = async (name, value, key) => wrap((await store(name, 'readwrite')).put(value, key));
const del = async (name, key) => wrap((await store(name, 'readwrite')).delete(key));
const userByName = async (name) => wrap((await store('users')).index('username').get(name.toLowerCase()));

// ---------- Static data ----------
let zones = null;
let zonesById = new Map();
let species = null;
async function loadZones() {
  if (!zones) {
    const res = await fetch('data/zones.json');
    if (!res.ok) fail(res.status, 'Could not load the map');
    const data = await res.json();
    zones = data;
    zonesById = new Map(data.zones.map((z) => [z.id, z]));
  }
  return zones;
}
async function loadSpecies() {
  if (!species) {
    const res = await fetch('data/species.json');
    if (!res.ok) fail(res.status, 'Could not load plant list');
    species = (await res.json()).species;
  }
  return species;
}

// ---------- Passwords (PBKDF2 via Web Crypto) ----------
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function hashPassword(password, saltB64) {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, key, 256);
  return { salt: b64(salt), hash: b64(bits) };
}

// ---------- Validation (same rules as the server) ----------
function cleanText(value, max, field, required = false) {
  // eslint-disable-next-line no-control-regex
  const s = typeof value === 'string' ? value.replace(/[\u0000-\u001F\u007F‪-‮⁦-⁩]/g, '').trim() : '';
  if (!s) { if (required) fail(400, `${field} is required`); return null; }
  if (s.length > max) fail(400, `${field} must be at most ${max} characters`);
  return s;
}

// ---------- Session ----------
const currentUserId = () => get('meta', 'session');
async function currentUser() {
  const id = await currentUserId();
  return id ? (await get('users', id)) || null : null;
}
const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.displayName, role: 'user' });

// ---------- Plants ----------
const urlCache = new Map();
function photoUrl(p) {
  if (!urlCache.has(p.id)) urlCache.set(p.id, URL.createObjectURL(p.photo));
  return urlCache.get(p.id);
}
const coarse = (n) => Math.round(n * 100) / 100;

async function serialize(p, viewerId, usersById) {
  const sp = (await loadSpecies()).find((s) => s.id === p.species);
  const z = zonesById.get(p.zoneId);
  const u = usersById.get(p.userId);
  const own = viewerId === p.userId;
  return {
    id: p.id,
    species: p.species,
    speciesName: sp ? sp.name : p.species,
    emoji: sp ? sp.emoji : '🪴',
    nickname: p.nickname,
    note: p.note,
    zone: z && { id: z.id, name: z.name, governorate: z.governorate },
    lat: own ? p.lat : coarse(p.lat),
    lng: own ? p.lng : coarse(p.lng),
    photoUrl: photoUrl(p),
    createdAt: p.createdAt,
    grower: { username: u?.username ?? '?', displayName: u?.displayName ?? '?' },
    mine: own,
    space: p.space ?? null, place: p.place ?? null, sun: p.sun ?? null,
    updatesCount: (p.updates || []).length,
    lastUpdateAt: (p.updates || []).length ? p.updates[p.updates.length - 1].createdAt : null,
    ...(own ? {
      waterDays: sp ? sp.waterDays : 3,
      lastWateredAt: p.lastWateredAt ?? null,
      nextWaterAt: (p.lastWateredAt || p.createdAt) + (sp ? sp.waterDays : 3) * DAY,
    } : {}),
  };
}
async function ownedPlant(id) {
  const viewer = await currentUserId();
  if (!viewer) fail(401, 'Please sign in first');
  const p = await get('plants', Number(id));
  if (!p) fail(404, 'Plant not found');
  if (p.userId !== viewer) fail(403, 'Only the grower can update this journey');
  return { p, viewer };
}
const updateUrls = new Map();
const updateUrl = (u) => { if (!updateUrls.has(u.id)) updateUrls.set(u.id, URL.createObjectURL(u.photo)); return updateUrls.get(u.id); };
const pickFrom = (v, list) => (list.includes(v) ? v : null);
async function usersMap() { return new Map((await getAll('users')).map((u) => [u.id, u])); }
const visible = (p) => !p.hidden;

// ---------- Demo content on first visit ----------
function drawPlant(seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const c = document.createElement('canvas');
  c.width = 400; c.height = 300;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 220);
  sky.addColorStop(0, '#c8e0ef'); sky.addColorStop(1, '#eef2df');
  g.fillStyle = sky; g.fillRect(0, 0, 400, 220);
  g.fillStyle = '#b0825a'; g.fillRect(0, 220, 400, 80);
  g.fillStyle = '#4a6e32'; g.fillRect(196, 150, 8, 80);
  const hue = 95 + rnd() * 40;
  for (let i = 0; i < 6 + rnd() * 5; i++) {
    g.fillStyle = `hsl(${hue + rnd() * 20 - 10} 45% ${30 + rnd() * 15}%)`;
    g.beginPath(); g.arc(200 + (rnd() - 0.5) * 160, 70 + rnd() * 110, 22 + rnd() * 30, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#be6a3c';
  g.beginPath(); g.moveTo(140, 215); g.lineTo(260, 215); g.lineTo(245, 262); g.lineTo(155, 262); g.closePath(); g.fill();
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.8));
}

async function seedIfEmpty() {
  if (await get('meta', 'seeded')) return;
  await put('meta', true, 'seeded');
  await loadZones(); const sp = (await loadSpecies()).filter((x) => x.id !== 'other');
  const growers = [['sara_k', 'سارة'], ['abdullah88', 'عبدالله'], ['green_fahad', 'فهد'], ['noura_plants', 'نورة'], ['yousef_q8', 'يوسف'], ['maryam_garden', 'مريم']];
  const ids = [];
  for (const [username, displayName] of growers) {
    ids.push(await put('users', { username, usernameLower: username, displayName, salt: '', hash: '!demo-account-no-login', createdAt: Date.now() - 40 * DAY }));
  }
  // A few areas start green so the map isn't empty; most of Kuwait is still brown, waiting for you.
  const hot = ['Salmiya', 'Salmiya', 'Salmiya', 'Salmiya', 'Salmiya', 'Salmiya', 'Salmiya', 'Salmiya', 'Salmiya', 'Salmiya', 'Salmiya',
    'Rumaithiya', 'Rumaithiya', 'Rumaithiya', 'Rumaithiya', 'Hawalli', 'Hawalli', 'Hawalli', 'Surra', 'Surra', 'Surra',
    'Fahaheel', 'Fahaheel', 'Kifan', 'Jahra', 'Qortuba', 'Egaila', 'Mangaf', 'Yarmouk', 'Failaka Island'];
  const notes = ['زرعتها مع أطفالي هذا الأسبوع 🌱', 'أسقيها كل مساء بعد الغروب', 'منطقتنا صارت أكثر خضرة!', null, 'أول تجربة لي — تمنّوا لي التوفيق', null];
  let seed = 7;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  for (let i = 0; i < hot.length; i++) {
    const z = zones.zones.find((zz) => zz.name === hot[i]);
    if (!z) continue;
    await put('plants', {
      userId: ids[i % ids.length], zoneId: z.id, species: sp[Math.floor(rnd() * sp.length)].id, nickname: null,
      note: notes[i % notes.length], lat: z.centroid[1], lng: z.centroid[0], photo: await drawPlant(i * 7919 + 13),
      hidden: false, reports: [], createdAt: Date.now() - Math.floor(rnd() * 20 * DAY) - 3600_000,
    });
  }
}

// ---------- The API ----------
export const localApi = {
  async zones() { const z = await loadZones(); await seedIfEmpty(); return z; },
  async species() { return { species: await loadSpecies() }; },

  async me() {
    const u = await currentUser();
    if (!u) return { user: null };
    const mine = (await getAll('plants')).filter((p) => p.userId === u.id);
    return { user: { ...publicUser(u), plants: mine.length, zones: new Set(mine.map((p) => p.zoneId)).size } };
  },

  async register(username, password, displayName) {
    username = cleanText(username, 24, 'Username', true);
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) fail(400, 'Username must be 3–24 letters, numbers or underscores');
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) fail(400, 'Password must be at least 8 characters');
    if (await userByName(username)) fail(409, 'That username is taken');
    const { salt, hash } = await hashPassword(password);
    const user = { username, usernameLower: username.toLowerCase(), displayName: cleanText(displayName, 40, 'Display name') || username, salt, hash, createdAt: Date.now() };
    user.id = await put('users', user);
    await put('meta', user.id, 'session');
    return { user: publicUser(user) };
  },

  /** Demo-only shortcut so visitors can try everything without making an account. */
  async guest() {
    const n = Math.floor(1000 + Math.random() * 9000);
    const ar = document.documentElement.lang === 'ar';
    const displayName = ar ? `ضيف ${n.toLocaleString('ar-KW', { useGrouping: false })}` : `Guest ${n}`;
    const user = { username: `guest_${n}`, usernameLower: `guest_${n}`, displayName, salt: '', hash: '!guest', createdAt: Date.now() };
    user.id = await put('users', user);
    await put('meta', user.id, 'session');
    return { user: publicUser(user) };
  },

  async login(username, password) {
    const u = username ? await userByName(username.trim()) : null;
    if (!u || !u.salt) fail(401, 'Wrong username or password');
    const { hash } = await hashPassword(password || '', u.salt);
    if (hash !== u.hash) fail(401, 'Wrong username or password');
    await put('meta', u.id, 'session');
    return { user: publicUser(u) };
  },

  async logout() { await del('meta', 'session'); return { ok: true }; },

  async stats() {
    await loadZones();
    const plants = (await getAll('plants')).filter(visible);
    const users = await usersMap();
    const zoneCounts = {};
    for (const p of plants) zoneCounts[p.zoneId] = (zoneCounts[p.zoneId] || 0) + 1;
    const byUser = new Map();
    for (const p of plants) {
      const e = byUser.get(p.userId) || { plants: 0, zones: new Set() };
      e.plants++; e.zones.add(p.zoneId); byUser.set(p.userId, e);
    }
    return {
      totalPlants: plants.length,
      totalGrowers: byUser.size,
      plantsThisWeek: plants.filter((p) => p.createdAt > Date.now() - 7 * DAY).length,
      greenZones: Object.keys(zoneCounts).length,
      totalZones: zones.zones.length,
      zoneCounts,
      points: plants.map((p) => [coarse(p.lng), coarse(p.lat)]),
      topZones: Object.entries(zoneCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => {
        const z = zonesById.get(id); return { id, name: z.name, governorate: z.governorate, plants: n };
      }),
      topGrowers: [...byUser].sort((a, b) => b[1].plants - a[1].plants).slice(0, 10).map(([id, e]) => {
        const u = users.get(id); return { username: u.username, displayName: u.displayName, plants: e.plants, zones: e.zones.size };
      }),
    };
  },

  async plants({ zone, before, limit = 20 } = {}) {
    await loadZones();
    const viewer = await currentUserId();
    const users = await usersMap();
    let list = (await getAll('plants')).filter(visible).sort((a, b) => b.id - a.id);
    if (zone) list = list.filter((p) => p.zoneId === zone);
    if (before) list = list.filter((p) => p.id < Number(before));
    const page = list.slice(0, limit);
    return { plants: await Promise.all(page.map((p) => serialize(p, viewer, users))), nextCursor: list.length > limit ? page[page.length - 1].id : null };
  },

  async myPlants() {
    const viewer = await currentUserId();
    if (!viewer) fail(401, 'Please sign in first');
    await loadZones();
    const users = await usersMap();
    const list = (await getAll('plants')).filter((p) => p.userId === viewer).sort((a, b) => b.id - a.id);
    return { plants: await Promise.all(list.map((p) => serialize(p, viewer, users))) };
  },

  async createPlant(fd) {
    const viewer = await currentUserId();
    if (!viewer) fail(401, 'Please sign in first');
    await loadZones();
    const photo = fd.get('photo');
    if (!(photo instanceof Blob) || !photo.size) fail(400, 'Please add a photo of your plant');
    if (photo.size > 6 * 1024 * 1024) fail(413, 'Photo is too large (max 6 MB)');
    const sp = cleanText(fd.get('species'), 40, 'Plant type', true);
    if (!(await loadSpecies()).some((s) => s.id === sp)) fail(400, 'Unknown plant type');
    const lat = Number(fd.get('lat')); const lng = Number(fd.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) fail(400, 'Invalid location');
    const zone = zoneAt(zones.zones, lng, lat);
    if (!zone) fail(400, 'That location is outside Kuwait\'s mapped areas. Pick a spot on land inside Kuwait.');
    const plant = {
      userId: viewer, zoneId: zone.id, species: sp, nickname: cleanText(fd.get('nickname'), 40, 'Nickname'),
      note: cleanText(fd.get('note'), 280, 'Note'), lat, lng, photo, hidden: false, reports: [], createdAt: Date.now(),
      space: pickFrom(fd.get('space'), ['small', 'medium', 'large']), place: pickFrom(fd.get('place'), ['balcony', 'roof', 'ground', 'indoor']),
      sun: pickFrom(fd.get('sun'), ['full', 'partial', 'shade']), lastWateredAt: null, updates: [],
    };
    plant.id = await put('plants', plant);
    return { plant: await serialize(plant, viewer, await usersMap()) };
  },

  async plant(id) {
    await loadZones();
    const viewer = await currentUserId();
    const p = await get('plants', Number(id));
    if (!p || (p.hidden && p.userId !== viewer)) fail(404, 'Plant not found');
    return {
      plant: await serialize(p, viewer, await usersMap()),
      updates: (p.updates || []).map((u) => ({ id: u.id, photoUrl: updateUrl(u), note: u.note, createdAt: u.createdAt })),
    };
  },

  async waterPlant(id) {
    const { p, viewer } = await ownedPlant(id);
    p.lastWateredAt = Date.now();
    await put('plants', p);
    return { plant: await serialize(p, viewer, await usersMap()) };
  },

  async addUpdate(id, fd) {
    const { p } = await ownedPlant(id);
    const photo = fd.get('photo');
    if (!(photo instanceof Blob) || !photo.size) fail(400, 'Please add a photo of your plant');
    if (photo.size > 6 * 1024 * 1024) fail(413, 'Photo is too large (max 6 MB)');
    const u = { id: `${p.id}-${Date.now()}`, photo, note: cleanText(fd.get('note'), 280, 'Note'), createdAt: Date.now() };
    p.updates = [...(p.updates || []), u];
    await put('plants', p);
    return { update: { id: u.id, photoUrl: updateUrl(u), note: u.note, createdAt: u.createdAt } };
  },

  async deletePlant(id) {
    const viewer = await currentUserId();
    const p = await get('plants', Number(id));
    if (!p) fail(404, 'Plant not found');
    if (p.userId !== viewer) fail(403, 'You can only remove your own plants');
    await del('plants', p.id);
    if (urlCache.has(p.id)) { URL.revokeObjectURL(urlCache.get(p.id)); urlCache.delete(p.id); }
    return { ok: true };
  },

  async reportPlant(id) {
    const viewer = await currentUserId();
    if (!viewer) fail(401, 'Please sign in first');
    const p = await get('plants', Number(id));
    if (!p) fail(404, 'Plant not found');
    if (p.userId === viewer) fail(400, 'You can\'t report your own plant');
    if (!p.reports.includes(viewer)) { p.reports.push(viewer); p.hidden = p.reports.length >= 3; await put('plants', p); }
    return { ok: true };
  },
};
