import { api, ApiError, useApi } from './api.js';
import { t, applyI18n, setLang, getLang } from './i18n.js';
import { KuwaitMap, levelFor, zoneAt } from './map.js';
import { recommendPlants, seasonFor } from './recommend.js';

const $ = (sel) => document.querySelector(sel);

/** Tiny DOM builder — always uses textContent, never innerHTML, so user content can't inject markup. */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const state = {
  user: null,
  zones: [],
  zoneById: new Map(),
  species: [],
  stats: null,
  view: 'map',
  feedCursor: null,
  feedZone: '',
  log: { file: null, blob: null, species: null, lat: null, lng: null, zone: null },
  wizard: { space: null, place: null, sun: null },
  myPlants: [],
  sheetZone: null,
};
let mainMap = null;
let pickMap = null;

// ---------- Helpers ----------
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 3200);
}

function errMsg(err) {
  if (err instanceof ApiError && err.status === 0) return t('offline');
  return err.message || String(err);
}

function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return t('justNow');
  if (s < 3600) return t('minAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return t('hrAgo', { n: Math.floor(s / 3600) });
  if (s < 86400 * 30) return t('dayAgo', { n: Math.floor(s / 86400) });
  return new Date(ts).toLocaleDateString(getLang() === 'ar' ? 'ar-KW' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Localised names: area / governorate / plant type follow the chosen language.
const isAr = () => getLang() === 'ar';
const zoneName = (zOrId) => { const z = typeof zOrId === 'string' ? state.zoneById.get(zOrId) : (zOrId && state.zoneById.get(zOrId.id)) || zOrId; return z ? (isAr() && z.nameAr ? z.nameAr : z.name) : ''; };
const govName = (z) => (isAr() && z.governorateAr ? z.governorateAr : z.governorate);
const speciesLabel = (p) => { const s = state.species.find((x) => x.id === p.species); return s ? (isAr() ? s.nameAr : s.name) : p.speciesName; };

const fmt = (n) => Number(n || 0).toLocaleString(getLang() === 'ar' ? 'ar-KW' : 'en-US');

function badgeFor(n) {
  if (n >= 50) return ['🏝️', t('badge4')];
  if (n >= 20) return ['🌳', t('badge3')];
  if (n >= 5) return ['🧑‍🌾', t('badge2')];
  if (n >= 1) return ['🌿', t('badge1')];
  return ['🌱', t('badge0')];
}

// ---------- Navigation ----------
function show(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });
  document.querySelectorAll('.tab').forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  });
  if (view === 'feed' && !$('#feed').childElementCount) loadFeed(true);
  if (view === 'log') prepareLog();
  if (view === 'me') renderMe();
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
}

// ---------- Stats & map ----------
async function refreshStats() {
  try {
    state.stats = await api.stats();
  } catch (err) {
    toast(errMsg(err));
    return;
  }
  const s = state.stats;
  const pct = s.totalZones ? Math.round((s.greenZones / s.totalZones) * 1000) / 10 : 0;
  $("#greenPct").textContent = `${fmt(pct)}%`;
  $('#greenZones').textContent = fmt(s.greenZones);
  $('#totalZones').textContent = fmt(s.totalZones);
  $('#progressFill').style.width = `${Math.max(pct, s.greenZones ? 1.5 : 0)}%`;
  $('#progressBar').setAttribute('aria-valuenow', String(pct));
  $('#statPlants').textContent = fmt(s.totalPlants);
  $('#statGrowers').textContent = fmt(s.totalGrowers);
  $('#statWeek').textContent = fmt(s.plantsThisWeek);
  mainMap?.setCounts(s.zoneCounts);
  mainMap?.setPoints(s.points || []);
  pickMap?.setCounts(s.zoneCounts);

  const tz = $('#topZones');
  tz.replaceChildren(...(s.topZones.length ? s.topZones.map((z) => h('li', {},
    h('button', { type: 'button', class: 'rank-btn', text: zoneName(z.id), onclick: () => openZone(z.id) }),
    h('span', { class: 'num', text: fmt(z.plants) }),
  )) : [h('p', { class: 'rank-empty', text: t('zoneNoPlants') })]));

  const tg = $('#topGrowers');
  tg.replaceChildren(...(s.topGrowers.length ? s.topGrowers.map((g) => h('li', {},
    h('span', { class: 'grow', text: g.displayName }),
    h('span', { class: 'num', text: `${fmt(g.plants)} 🌱` }),
  )) : [h('p', { class: 'rank-empty', text: t('beFirst') })]));
}

// ---------- Plant cards ----------
function plantCard(p, { onRemoved } = {}) {
  const actions = h('div', { class: 'plant-actions' });
  if (p.mine) {
    actions.append(h('button', {
      type: 'button', class: 'link-btn danger', text: t('remove'),
      onclick: async () => {
        if (!confirm(t('confirmRemove'))) return;
        try { await api.deletePlant(p.id); toast(t('removed')); card.remove(); onRemoved?.(); refreshStats(); refreshMe(); } catch (err) { toast(errMsg(err)); }
      },
    }));
  } else if (state.user) {
    actions.append(h('button', {
      type: 'button', class: 'link-btn', text: t('report'),
      onclick: async (e) => {
        if (!confirm(t('confirmReport'))) return;
        try { await api.reportPlant(p.id); toast(t('reported')); e.target.disabled = true; } catch (err) { toast(errMsg(err)); }
      },
    }));
  }
  const spName = speciesLabel(p);
  const title = p.nickname ? `${p.nickname}` : spName;
  const card = h('article', { class: 'plant-card' },
    h('img', { class: 'plant-photo', src: p.photoUrl, alt: `${spName}${p.nickname ? ` — ${p.nickname}` : ''}`, loading: 'lazy', decoding: 'async', width: 400, height: 300 }),
    h('div', { class: 'plant-body' },
      h('div', { class: 'plant-title' }, h('span', { 'aria-hidden': 'true', text: p.emoji }), h('span', { text: title })),
      p.nickname ? h('div', { class: 'plant-meta', text: spName }) : null,
      h('div', {}, h('span', { class: 'chip', text: `📍 ${p.zone ? zoneName(p.zone) : ''}` })),
      h('div', { class: 'plant-meta', text: `${t('by', { name: p.grower.displayName })} · ${timeAgo(p.createdAt)}` }),
      p.note ? h('p', { class: 'plant-note', text: p.note }) : null,
      actions.childElementCount ? actions : null,
    ),
  );
  return card;
}

function emptyState(title, sub) {
  return h('div', { class: 'empty' }, h('span', { class: 'big-emoji', 'aria-hidden': 'true', text: '🏜️' }), h('strong', { text: title }), h('div', { text: sub }));
}

// ---------- Feed ----------
async function loadFeed(reset = false) {
  const feed = $('#feed');
  if (reset) { state.feedCursor = null; feed.replaceChildren(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' })); }
  try {
    const { plants, nextCursor } = await api.plants({ zone: state.feedZone, before: reset ? null : state.feedCursor });
    if (reset) feed.replaceChildren();
    if (reset && !plants.length) feed.append(emptyState(t('noPlantsYet'), t('beFirst')));
    feed.append(...plants.map((p) => plantCard(p)));
    state.feedCursor = nextCursor;
    $('#feedMore').hidden = !nextCursor;
  } catch (err) {
    if (reset) feed.replaceChildren();
    toast(errMsg(err));
  }
}

function fillAreaSelect(select, placeholder) {
  const byGov = new Map();
  for (const z of state.zones) {
    if (!byGov.has(govName(z))) byGov.set(govName(z), []);
    byGov.get(govName(z)).push(z);
  }
  select.replaceChildren(h('option', { value: '', text: placeholder }));
  const collator = new Intl.Collator(isAr() ? 'ar' : 'en');
  for (const [gov, zones] of [...byGov].sort((a, b) => collator.compare(a[0], b[0]))) {
    zones.sort((a, b) => collator.compare(zoneName(a), zoneName(b)));
    select.append(h('optgroup', { label: gov }, zones.map((z) => h('option', { value: z.id, text: zoneName(z) }))));
  }
}

// ---------- Zone sheet ----------
async function openZone(id) {
  const z = state.zoneById.get(id);
  if (!z) return;
  state.sheetZone = id;
  mainMap?.highlight(id);
  const count = state.stats?.zoneCounts[id] || 0;
  $('#zoneSheetTitle').textContent = zoneName(z);
  $('#zoneSheetGov').textContent = govName(z);
  const badge = $('#zoneSheetBadge');
  badge.replaceChildren(
    h('i', { class: `sw lvl-${levelFor(count)}` }),
    h('span', { text: count === 0 ? t('zoneNoPlants') : count === 1 ? t('zoneOnePlant') : t('zonePlants', { n: fmt(count) }) }),
  );
  const feed = $('#zoneSheetFeed');
  feed.replaceChildren();
  feed.hidden = count === 0;
  $('#sheetBackdrop').hidden = false;
  $('#zoneSheet').hidden = false;
  $('#sheetClose').focus();
  if (count) {
    try {
      const { plants } = await api.plants({ zone: id, limit: 12 });
      if (state.sheetZone === id) feed.replaceChildren(...plants.map((p) => plantCard(p)));
    } catch (err) { toast(errMsg(err)); }
  }
}
function closeZone() {
  $('#zoneSheet').hidden = true;
  $('#sheetBackdrop').hidden = true;
  mainMap?.highlight(null);
  state.sheetZone = null;
}

// ---------- Log a plant ----------
function prepareLog() {
  const signedIn = !!state.user;
  $('#logAuthNeeded').hidden = signedIn;
  $('#logForm').hidden = !signedIn;
  $('#publishHead').hidden = false;
  if (signedIn && !pickMap) {
    pickMap = new KuwaitMap($('#pickMap'), state.zones, { pickMode: true, onPick: (lng, lat) => setLocation(lng, lat), label: 'Location picker', namer: zoneName });
    if (state.stats) pickMap.setCounts(state.stats.zoneCounts);
    if (state.log.lng != null) { pickMap.setPin(state.log.lng, state.log.lat); pickMap.focusZone(state.log.zone?.id); }
  }
}

function setLocStatus(text, cls = '') {
  const el = $('#locStatus');
  el.textContent = text;
  el.className = `loc-status ${cls}`;
}

function setLocation(lng, lat, { focus = false } = {}) {
  const zone = zoneAt(state.zones, lng, lat);
  if (!zone) {
    setLocStatus(t('locOutside'), 'err');
    return false;
  }
  state.log.lng = lng; state.log.lat = lat; state.log.zone = zone;
  pickMap?.setPin(lng, lat);
  pickMap?.highlight(zone.id);
  if (focus) pickMap?.focusZone(zone.id);
  $('#areaSelect').value = zone.id;
  setLocStatus(t('locFound', { zone: zoneName(zone), gov: govName(zone) }), 'ok');
  return true;
}

function useGps() {
  if (!('geolocation' in navigator)) { setLocStatus(t('gpsUnavailable'), 'err'); return; }
  setLocStatus(t('locating'));
  navigator.geolocation.getCurrentPosition(
    (pos) => setLocation(pos.coords.longitude, pos.coords.latitude, { focus: true }),
    (err) => setLocStatus(err.code === err.PERMISSION_DENIED ? t('gpsDenied') : t('gpsUnavailable'), 'err'),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
  );
}

/** Resize and re-encode the photo to JPEG in the browser: smaller uploads, and EXIF (incl. GPS) is dropped. */
async function compressImage(file, maxSide = 1600, quality = 0.82) {
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  const w = source.width, hgt = source.height;
  const scale = Math.min(1, maxSide / Math.max(w, hgt));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(hgt * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality));
}

async function onPhotoChosen(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const blob = await compressImage(file);
    state.log.blob = blob;
    const preview = $('#photoPreview');
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.src = URL.createObjectURL(blob);
    preview.alt = t('stepPhoto');
    preview.hidden = false;
    $('#photoPlaceholder').hidden = true;
  } catch {
    toast(t('photoTooBig'));
  }
}

function renderSpeciesGrid() {
  const grid = $('#speciesGrid');
  const ar = getLang() === 'ar';
  grid.replaceChildren(...state.species.map((s) => h('button', {
    type: 'button', role: 'radio', class: 'species-opt', 'aria-checked': String(state.log.species === s.id), dataset: { id: s.id },
    onclick: () => {
      state.log.species = s.id;
      grid.querySelectorAll('.species-opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === s.id)));
    },
  }, h('span', { class: 'e', 'aria-hidden': 'true', text: s.emoji }), h('span', { text: ar ? s.nameAr : s.name }))));
}

function showLogError(msg) {
  const el = $('#logError');
  el.textContent = msg;
  el.hidden = !msg;
  if (msg) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function submitPlant(e) {
  e.preventDefault();
  const L = state.log;
  if (!L.blob) return showLogError(t('needPhoto'));
  if (!L.species) return showLogError(t('needSpecies'));
  if (L.lat == null) return showLogError(t('needLocation'));
  showLogError('');

  const prevCount = state.stats?.zoneCounts[L.zone.id] || 0;
  const fd = new FormData();
  fd.append('species', L.species);
  fd.append('nickname', $('#nickname').value);
  fd.append('note', $('#note').value);
  fd.append('lat', String(L.lat));
  fd.append('lng', String(L.lng));
  fd.append('photo', L.blob, 'plant.jpg');
  for (const k of ['space', 'place', 'sun']) if (state.wizard[k]) fd.append(k, state.wizard[k]);

  const btn = $('#logSubmit');
  btn.disabled = true;
  const label = btn.lastElementChild.textContent;
  btn.lastElementChild.textContent = t('planting');
  try {
    const { plant } = await api.createPlant(fd);
    resetLogForm();
    await refreshStats();
    refreshMe();
    $('#feed').replaceChildren();
    const newCount = state.stats?.zoneCounts[plant.zone.id] || prevCount + 1;
    state.justPublished = plant;
    celebrate(plant.zone, prevCount, newCount);
  } catch (err) {
    showLogError(errMsg(err));
  } finally {
    btn.disabled = false;
    btn.lastElementChild.textContent = label;
  }
}

function resetLogForm() {
  $('#logForm').reset();
  const preview = $('#photoPreview');
  if (preview.src) URL.revokeObjectURL(preview.src);
  preview.removeAttribute('src');
  preview.hidden = true;
  $('#photoPlaceholder').hidden = false;
  state.log = { blob: null, species: null, lat: null, lng: null, zone: null };
  renderSpeciesGrid();
  pickMap?.setPin(null);
  pickMap?.highlight(null);
  pickMap?.reset();
  setLocStatus(t('tapMapToPin'));
}

function celebrate(zone, prev, now) {
  let title, text;
  zone = { ...zone, name: zoneName(zone) };
  if (prev === 0) { title = t('greenedTitle', { zone: zone.name }); text = t('greenedText', { zone: zone.name }); }
  else if (levelFor(now) > levelFor(prev)) { title = t('levelUpTitle', { zone: zone.name }); text = t('levelUpText', { zone: zone.name }); }
  else { title = t('plantedTitle'); text = t('plantedText', { zone: zone.name, n: fmt(now) }); }
  $('#celebrateTitle').textContent = title;
  $('#celebrateText').textContent = text;
  $('#celebrate').hidden = false;
  $('#celebrateOk').focus();
  $('#celebrateOk').onclick = () => {
    $('#celebrate').hidden = true;
    show('map');
    mainMap?.focusZone(zone.id, { maxZoom: 6 });
    setTimeout(() => {
      mainMap?.flash(zone.id);
      const jp = state.justPublished;
      if (jp) mainMap?.pulseNewest(Math.round(jp.lng * 100) / 100, Math.round(jp.lat * 100) / 100);
    }, 200);
  };
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) confetti();
}

function confetti() {
  const colors = ['#2f7d4a', '#79b45e', '#b6cf7e', '#c8873f', '#f2c94c'];
  for (let i = 0; i < 60; i++) {
    const c = h('div', { class: 'confetti' });
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = `${1.8 + Math.random() * 1.8}s`;
    c.style.animationDelay = `${Math.random() * 0.4}s`;
    document.body.append(c);
    setTimeout(() => c.remove(), 4200);
  }
}

// ---------- Learn ----------
function renderGuide() {
  const ar = getLang() === 'ar';
  const heat = { 3: t('heatLove'), 2: t('heatOk'), 1: t('heatShade') };
  $('#speciesGuide').replaceChildren(...state.species.filter((s) => s.id !== 'other').map((s) => h('article', { class: 'guide-item' },
    h('div', { class: 'guide-top' },
      h('span', { class: 'e', 'aria-hidden': 'true', text: s.emoji }),
      h('div', {}, h('h3', { text: ar ? s.nameAr : s.name }), h('div', { class: 'ar', text: ar ? s.name : s.nameAr })),
    ),
    h('div', { class: 'guide-tags' },
      s.native ? h('span', { class: 'tag native', text: t('native') }) : null,
      h('span', { class: 'tag', text: ar ? s.typeAr : s.type }),
      h('span', { class: 'tag', text: `☀️ ${heat[s.heat]}` }),
    ),
    h('p', { text: ar ? s.tipAr : s.tip }),
    h('p', { class: 'guide-water', text: `💧 ${ar ? s.waterAr : s.water}` }),
  )));
}

// ---------- Auth & profile ----------
let authMode = 'login';
function setAuthMode(mode) {
  authMode = mode;
  const reg = mode === 'register';
  $('#authTabLogin').classList.toggle('active', !reg);
  $('#authTabRegister').classList.toggle('active', reg);
  $('#authTabLogin').setAttribute('aria-selected', String(!reg));
  $('#authTabRegister').setAttribute('aria-selected', String(reg));
  $('#displayNameField').hidden = !reg;
  $('#pwHelp').hidden = !reg;
  $('#authPassword').autocomplete = reg ? 'new-password' : 'current-password';
  $('#authSubmit').textContent = reg ? t('createAccount') : t('signIn');
  $('#authError').hidden = true;
}

async function submitAuth(e) {
  e.preventDefault();
  const username = $('#authUsername').value.trim();
  const password = $('#authPassword').value;
  const btn = $('#authSubmit');
  btn.disabled = true;
  try {
    const { user } = authMode === 'register'
      ? await api.register(username, password, $('#authDisplayName').value.trim())
      : await api.login(username, password);
    state.user = user;
    $('#authForm').reset();
    toast(t('welcome', { name: user.displayName }));
    await refreshMe();
    if (location.hash === '#log' || state.pendingLog) { state.pendingLog = false; show('log'); } else renderMe();
    $('#feed').replaceChildren();
  } catch (err) {
    const el = $('#authError');
    el.textContent = errMsg(err);
    el.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

async function refreshMe() {
  try {
    const { user } = await api.me();
    state.user = user;
  } catch { /* keep current */ }
  if (state.view === 'me') renderMe(); else loadReminders();
}

async function renderMe() {
  const u = state.user;
  $('#authBox').hidden = !!u;
  $('#profileBox').hidden = !u;
  if (!u) { setAuthMode(authMode); return; }
  $('#profileName').textContent = u.displayName;
  $('#profileUsername').textContent = u.username;
  $('#myPlants').textContent = fmt(u.plants);
  $('#myZones').textContent = fmt(u.zones);
  const [emoji, label] = badgeFor(u.plants || 0);
  $('#myBadge').textContent = emoji;
  $('#myBadgeLabel').textContent = label;
  $('#avatar').textContent = emoji;
  const feed = $('#myFeed');
  try {
    const { plants } = await api.myPlants();
    state.myPlants = plants;
    feed.replaceChildren(...(plants.length ? plants.map((p) => journeyCard(p)) : [emptyState(t('noMyPlants'), t('startGarden'))]));
    updateReminders();
  } catch (err) { toast(errMsg(err)); }
  $('#notifBtn').hidden = !('Notification' in window) || Notification.permission === 'granted' || !state.myPlants.length;
}

// ---------- Feature 2: Start planting (recommendations) ----------
function setChoice(group, value) {
  state.wizard[group.dataset.name] = value;
  group.querySelectorAll('.choice').forEach((b) => {
    const on = b.dataset.value === value;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function waterText(n) {
  if (n === 1) return t('waterDaily');
  if (isAr()) return n === 2 ? '💧 اسقِها كل يومين' : `💧 اسقِها كل ${fmt(n)} ${n <= 10 ? 'أيام' : 'يومًا'}`;
  return t('waterEvery', { n: fmt(n) });
}
function updatesText(n) {
  if (!isAr()) return t('updatesN', { n: fmt(n) });
  if (n === 1) return '📷 صورة نمو واحدة';
  if (n === 2) return '📷 صورتا نمو';
  return `📷 ${fmt(n)} ${n <= 10 ? 'صور' : 'صورة'} نمو`;
}

function whenText(ts) {
  const days = Math.ceil((ts - Date.now()) / 86_400_000);
  if (days <= 0) return t('today');
  if (days === 1) return t('tomorrow');
  if (isAr()) {
    // Arabic number agreement: يومين / ٣–١٠ أيام / ١١+ يومًا
    if (days === 2) return 'بعد يومين';
    return days <= 10 ? `بعد ${fmt(days)} أيام` : `بعد ${fmt(days)} يومًا`;
  }
  return t('inDays', { n: fmt(days) });
}

function renderRecommendations() {
  const { space, place, sun } = state.wizard;
  const err = $('#wizardError');
  if (!space || !place || !sun) { err.textContent = t('pickAll'); err.hidden = false; return; }
  err.hidden = true;
  const month = new Date().getMonth() + 1;
  const picks = recommendPlants(state.species, { space, place, sun }, month);
  const ar = isAr();
  $('#recoTitle').textContent = t('recoTitle', { season: t(`season_${seasonFor(month)}`) });
  $('#recoList').replaceChildren(...picks.map(({ species: s, reasons }, i) => h('article', { class: 'reco-card' },
    h('div', { class: 'reco-rank', text: fmt(i + 1) }),
    h('div', { class: 'reco-top' },
      h('span', { class: 'e', 'aria-hidden': 'true', text: s.emoji }),
      h('div', {}, h('h4', { text: ar ? s.nameAr : s.name }), h('div', { class: 'muted small', text: ar ? s.typeAr : s.type })),
    ),
    h('ul', { class: 'reasons' }, reasons.slice(0, 4).map((r) => h('li', { text: t(r) }))),
    h('p', { class: 'small', text: ar ? s.tipAr : s.tip }),
    h('p', { class: 'small water', text: waterText(s.waterDays) }),
    h('button', { type: 'button', class: 'btn btn-secondary btn-block', onclick: () => chooseRecommended(s.id) }, h('span', { 'aria-hidden': 'true', text: '🌱 ' }), t('chooseThis')),
  )));
  $('#recoResults').hidden = false;
  $('#recoResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function chooseRecommended(speciesId) {
  state.log.species = speciesId;
  renderSpeciesGrid();
  toast(t('chosen'));
  const target = state.user ? $('#logForm') : $('#logAuthNeeded');
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Feature 2: Crop journey (growth photos + watering reminders) ----------
function journeyCard(p) {
  const days = Math.max(1, Math.floor((Date.now() - p.createdAt) / 86_400_000) + 1);
  const due = p.nextWaterAt != null && p.nextWaterAt <= Date.now();
  const card = h('article', { class: `plant-card journey${due ? ' due' : ''}` },
    h('img', { class: 'plant-photo', src: p.coverUrl || p.photoUrl, alt: speciesLabel(p), loading: 'lazy', width: 400, height: 300 }),
    h('div', { class: 'plant-body' },
      h('div', { class: 'plant-title' }, h('span', { 'aria-hidden': 'true', text: p.emoji }), h('span', { text: p.nickname || speciesLabel(p) })),
      h('div', { class: 'journey-meta' },
        h('span', { class: 'chip', text: `📍 ${zoneName(p.zone)}` }),
        h('span', { class: 'chip chip-soft', text: t('dayN', { n: fmt(days) }) }),
        p.updatesCount ? h('span', { class: 'chip chip-soft', text: updatesText(p.updatesCount) }) : null,
      ),
      h('div', { class: `water-line${due ? ' due' : ''}`, text: due ? t('waterDue') : t('waterIn', { when: whenText(p.nextWaterAt) }) }),
      h('div', { class: 'journey-actions' },
        h('button', { type: 'button', class: `btn ${due ? 'btn-primary' : 'btn-secondary'} btn-sm`, onclick: () => waterJourney(p.id) }, '💧 ', t('wateredBtn')),
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => pickGrowthPhoto(p.id) }, '📷 ', t('addGrowth')),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => openJourney(p.id) }, t('viewJourney')),
      ),
      h('div', { class: 'journey-foot' },
        h('button', { type: 'button', class: 'link-btn danger', text: t('remove'), onclick: async () => {
          if (!confirm(t('confirmRemove'))) return;
          try { await api.deletePlant(p.id); toast(t('removed')); refreshStats(); refreshMe(); renderMe(); } catch (e) { toast(errMsg(e)); }
        } }),
      ),
    ),
  );
  return card;
}

async function waterJourney(id) {
  try {
    const { plant } = await api.waterPlant(id);
    toast(t('wateredToast', { when: whenText(plant.nextWaterAt) }));
    await renderMe();
  } catch (err) { toast(errMsg(err)); }
}

let growthTarget = null;
function pickGrowthPhoto(id) {
  growthTarget = id;
  $('#growthInput').value = '';
  $('#growthInput').click();
}
async function onGrowthPhoto(e) {
  const file = e.target.files?.[0];
  if (!file || growthTarget == null) return;
  try {
    const blob = await compressImage(file);
    const fd = new FormData();
    fd.append('photo', blob, 'growth.jpg');
    await api.addUpdate(growthTarget, fd);
    toast(t('growthAdded'));
    await renderMe();
    if (!$('#journeySheet').hidden) openJourney(growthTarget);
  } catch (err) { toast(errMsg(err)); }
}

async function openJourney(id) {
  try {
    const { plant: p, updates } = await api.plant(id);
    const s = state.species.find((x) => x.id === p.species);
    const ar = isAr();
    $('#journeyTitle').textContent = `${p.emoji} ${p.nickname || speciesLabel(p)}`;
    $('#journeySub').textContent = `${zoneName(p.zone)} · ${speciesLabel(p)}`;
    $('#journeyCare').replaceChildren(
      p.nextWaterAt != null ? h('div', { class: `water-line${p.nextWaterAt <= Date.now() ? ' due' : ''}`, text: p.nextWaterAt <= Date.now() ? t('waterDue') : t('waterIn', { when: whenText(p.nextWaterAt) }) }) : null,
      s ? h('p', {}, h('strong', { text: `${t('careTip')}: ` }), ar ? s.tipAr : s.tip) : null,
      p.mine ? h('div', { class: 'journey-actions' },
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => waterJourney(p.id).then(() => openJourney(p.id)) }, '💧 ', t('wateredBtn')),
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => pickGrowthPhoto(p.id) }, '📷 ', t('addGrowth')),
      ) : null,
    );
    const entries = [{ photoUrl: p.photoUrl, note: p.note, createdAt: p.createdAt, first: true }, ...updates];
    $('#journeyTimeline').replaceChildren(...entries.map((u) => h('li', {},
      h('div', { class: 'tl-head' },
        h('strong', { text: u.first ? t('journeyStart') : t('growthUpdate') }),
        h('span', { class: 'muted small', text: `${t('dayN', { n: fmt(Math.floor((u.createdAt - p.createdAt) / 86_400_000) + 1) })} · ${timeAgo(u.createdAt)}` }),
      ),
      h('img', { src: u.photoUrl, alt: '', loading: 'lazy', width: 400, height: 300 }),
      u.note ? h('p', { text: u.note }) : null,
    )));
    $('#sheetBackdrop').hidden = false;
    $('#journeySheet').hidden = false;
    $('#journeyClose').focus();
  } catch (err) { toast(errMsg(err)); }
}
function closeJourney() {
  $('#journeySheet').hidden = true;
  if ($('#zoneSheet').hidden) $('#sheetBackdrop').hidden = true;
}

// Reminders: in-app banner + badge, and a browser notification when allowed.
let notifiedFor = '';
function updateReminders() {
  const due = state.myPlants.filter((p) => p.nextWaterAt != null && p.nextWaterAt <= Date.now());
  const names = due.map((p) => p.nickname || speciesLabel(p));
  $('#reminderBanner').hidden = !due.length;
  $('#meBadge').hidden = !due.length;
  if (due.length) $('#reminderText').textContent = t('reminderBanner', { names: names.join('، ') });
  const key = due.map((p) => p.id).join(',');
  if (due.length && key !== notifiedFor && 'Notification' in window && Notification.permission === 'granted') {
    notifiedFor = key;
    try { new Notification(t('notifTitle'), { body: names.join('، '), icon: 'icons/icon-192.png', tag: 'arfaj-water' }); } catch { /* some browsers need a service worker */ }
  }
}
async function loadReminders() {
  if (!state.user) { state.myPlants = []; updateReminders(); return; }
  try { state.myPlants = (await api.myPlants()).plants; updateReminders(); } catch { /* offline */ }
}

// ---------- Boot ----------
async function boot() {
  applyI18n();
  $('#langToggle').textContent = getLang() === 'ar' ? 'English' : 'عربي';

  // Wire up UI.
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => show(tab.dataset.view)));
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { state.pendingLog = true; show(b.dataset.goto); }));
  $('#langToggle').addEventListener('click', () => {
    setLang(getLang() === 'ar' ? 'en' : 'ar');
    $('#langToggle').textContent = getLang() === 'ar' ? 'English' : 'عربي';
    renderSpeciesGrid(); renderGuide(); refreshStats(); setAuthMode(authMode);
    mainMap?.setNamer(zoneName); pickMap?.setNamer(zoneName);
    if (state.attribution) $('#attribution').textContent = isAr() && state.attribution.attributionAr ? state.attribution.attributionAr : state.attribution.attribution;
    if (state.log.zone) setLocation(state.log.lng, state.log.lat);
    if (state.sheetZone) openZone(state.sheetZone);
    if (!$('#recoResults').hidden) renderRecommendations();
    updateReminders();
    fillAreaSelect($('#feedZone'), t('allAreas')); $('#feedZone').value = state.feedZone;
    fillAreaSelect($('#areaSelect'), t('chooseArea')); if (state.log.zone) $('#areaSelect').value = state.log.zone.id;
    if (state.view === 'feed') loadFeed(true); else $('#feed').replaceChildren();
    if (state.view === 'me') renderMe();
  });
  $('#zoomIn').addEventListener('click', () => mainMap?.zoomBy(1.5));
  $('#zoomOut').addEventListener('click', () => mainMap?.zoomBy(1 / 1.5));
  $('#zoomReset').addEventListener('click', () => mainMap?.reset());
  $('#zoomCity').addEventListener('click', () => mainMap?.focusBounds([47.85, 29.05, 48.2, 29.42]));
  $('#sheetClose').addEventListener('click', closeZone);
  $('#sheetBackdrop').addEventListener('click', () => { closeJourney(); closeZone(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#journeySheet').hidden) closeJourney(); else if (!$('#zoneSheet').hidden) closeZone();
  });
  $('#zoneSheetPlant').addEventListener('click', () => {
    const z = state.zoneById.get(state.sheetZone);
    closeZone();
    show('log');
    if (z && state.user) setLocation(z.centroid[0], z.centroid[1], { focus: true });
  });
  $('#feedZone').addEventListener('change', (e) => { state.feedZone = e.target.value; loadFeed(true); });
  $('#feedMore').addEventListener('click', () => loadFeed(false));
  $('#photoInput').addEventListener('change', onPhotoChosen);
  $('#useGps').addEventListener('click', useGps);
  $('#areaSelect').addEventListener('change', (e) => {
    const z = state.zoneById.get(e.target.value);
    if (z) setLocation(z.centroid[0], z.centroid[1], { focus: true });
  });
  $('#logForm').addEventListener('submit', submitPlant);
  $('#authTabLogin').addEventListener('click', () => setAuthMode('login'));
  $('#authTabRegister').addEventListener('click', () => setAuthMode('register'));
  $('#authForm').addEventListener('submit', submitAuth);
  document.querySelectorAll('.choice-group').forEach((g) => g.querySelectorAll('.choice').forEach((b) => {
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => setChoice(g, b.dataset.value));
  }));
  $('#recommendBtn').addEventListener('click', renderRecommendations);
  $('#growthInput').addEventListener('change', onGrowthPhoto);
  $('#journeyClose').addEventListener('click', closeJourney);
  $('#reminderGo').addEventListener('click', () => show('me'));
  $('#notifBtn').addEventListener('click', async () => {
    const perm = await Notification.requestPermission().catch(() => 'denied');
    if (perm === 'granted') { toast(t('notifOn')); $('#notifBtn').hidden = true; notifiedFor = ''; updateReminders(); }
  });
  setInterval(() => { if (document.visibilityState === 'visible') updateReminders(); }, 60_000);
  document.querySelectorAll('.guest-btn').forEach((b) => b.addEventListener('click', async () => {
    try {
      const { user } = await api.guest();
      state.user = user;
      toast(t('welcome', { name: user.displayName }));
      await refreshMe();
      show('log');
    } catch (err) { toast(errMsg(err)); }
  }));
  $('#logoutBtn').addEventListener('click', async () => {
    try { await api.logout(); } catch { /* ignore */ }
    state.user = null;
    state.myPlants = [];
    updateReminders();
    toast(t('signedOut'));
    $('#feed').replaceChildren();
    renderMe();
  });

  // Load data. With no server behind the page (e.g. GitHub Pages), switch to the in-browser demo mode.
  try {
    await api.zones();
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      const { localApi } = await import('./local-api.js');
      useApi(localApi);
      state.demo = true;
      document.body.classList.add('demo-mode');
      $('#demoBanner').hidden = false;
      document.querySelectorAll('.guest-btn').forEach((b) => { b.hidden = false; });
    }
  }
  const [zonesRes, speciesRes, meRes] = await Promise.allSettled([api.zones(), api.species(), api.me()]);
  if (zonesRes.status !== 'fulfilled') { toast(errMsg(zonesRes.reason)); return; }
  state.zones = zonesRes.value.zones;
  state.zoneById = new Map(state.zones.map((z) => [z.id, z]));
  state.attribution = zonesRes.value;
  $('#attribution').textContent = isAr() && zonesRes.value.attributionAr ? zonesRes.value.attributionAr : zonesRes.value.attribution;
  if (speciesRes.status === 'fulfilled') state.species = speciesRes.value.species;
  if (meRes.status === 'fulfilled') state.user = meRes.value.user;

  mainMap = new KuwaitMap($('#mainMap'), state.zones, { onZoneClick: openZone, label: t('appName'), namer: zoneName });
  mainMap.tooltipText = (z) => `${zoneName(z)} · ${t('plantsCount', { n: fmt(state.stats?.zoneCounts[z.id] || 0) })}`;
  fillAreaSelect($('#feedZone'), t('allAreas'));
  fillAreaSelect($('#areaSelect'), t('chooseArea'));
  renderSpeciesGrid();
  renderGuide();
  await refreshStats();

  loadReminders();
  const initial = location.hash.slice(1);
  show(['map', 'feed', 'log', 'learn', 'me'].includes(initial) ? initial : 'map');

  // Keep the map live while the app is open.
  setInterval(() => { if (document.visibilityState === 'visible' && state.view === 'map') refreshStats(); }, 60_000);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
