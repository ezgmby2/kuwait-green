import express from 'express';
import multer from 'multer';
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { openDb, tx } from './db.js';
import { createZoneIndex } from './geo.js';
import { sanitizeImage } from './images.js';
import { SPECIES, SPECIES_IDS } from './species.js';
import {
  hashPassword, verifyPassword, dummyVerify, newToken, hashToken,
  securityHeaders, csrfGuard, rateLimit, parseCookies,
} from './security.js';

const COOKIE = 'kg_session';
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
const DAY = 86_400_000;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);

/** Trims a string, strips control characters and enforces a max length. */
function cleanText(value, max, { required = false, field = 'Field' } = {}) {
  if (value == null || value === '') {
    if (required) throw bad(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string') throw bad(`${field} must be text`);
  // eslint-disable-next-line no-control-regex
  const s = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '').trim();
  if (!s) { if (required) throw bad(`${field} is required`); return null; }
  if (s.length > max) throw bad(`${field} must be at most ${max} characters`);
  return s;
}

/** Builds the Express app. `config` comes from loadConfig() in ./config.js. */
export function createApp(config) {
  const db = openDb(config.dbPath);
  mkdirSync(config.uploadDir, { recursive: true });

  const zonesFile = readFileSync(config.zonesPath);
  const zonesData = JSON.parse(zonesFile);
  const zoneIndex = createZoneIndex(zonesData.zones);
  const zonesEtag = `"${createHash('sha1').update(zonesFile).digest('hex').slice(0, 16)}"`;
  const zoneMeta = (z) => z && { id: z.id, name: z.name, governorate: z.governorate };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders(config));

  // ---------- Prepared statements ----------
  const q = {
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    insertUser: db.prepare('INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    sessionUser: db.prepare(`SELECT u.id, u.username, u.display_name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
                             WHERE s.token_hash = ? AND s.expires_at > ?`),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    insertPlant: db.prepare(`INSERT INTO plants (user_id, zone_id, species, nickname, note, lat, lng, photo, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    plantById: db.prepare('SELECT * FROM plants WHERE id = ?'),
    deletePlant: db.prepare('DELETE FROM plants WHERE id = ?'),
    zoneCounts: db.prepare('SELECT zone_id, COUNT(*) AS n FROM plants WHERE hidden = 0 GROUP BY zone_id'),
    totals: db.prepare('SELECT COUNT(*) AS plants, COUNT(DISTINCT user_id) AS growers FROM plants WHERE hidden = 0'),
    plantsThisWeek: db.prepare('SELECT COUNT(*) AS n FROM plants WHERE hidden = 0 AND created_at > ?'),
    topGrowers: db.prepare(`SELECT u.username, u.display_name, COUNT(*) AS plants, COUNT(DISTINCT p.zone_id) AS zones
                            FROM plants p JOIN users u ON u.id = p.user_id WHERE p.hidden = 0
                            GROUP BY u.id ORDER BY plants DESC, MIN(p.created_at) ASC LIMIT 10`),
    myStats: db.prepare('SELECT COUNT(*) AS plants, COUNT(DISTINCT zone_id) AS zones FROM plants WHERE user_id = ?'),
    insertReport: db.prepare('INSERT OR IGNORE INTO reports (plant_id, user_id, reason, created_at) VALUES (?, ?, ?, ?)'),
    bumpReports: db.prepare('UPDATE plants SET report_count = report_count + 1, hidden = CASE WHEN report_count + 1 >= ? THEN 1 ELSE hidden END WHERE id = ?'),
  };

  const FEED_SELECT = `SELECT p.id, p.zone_id, p.species, p.nickname, p.note, p.lat, p.lng, p.photo, p.created_at, p.user_id,
                              u.username, u.display_name
                       FROM plants p JOIN users u ON u.id = p.user_id`;

  // Public views never expose exact coordinates — only ~1 km precision — to protect growers' home locations.
  const coarse = (n) => Math.round(n * 100) / 100;
  function serializePlant(row, viewer) {
    const own = viewer && viewer.id === row.user_id;
    const species = SPECIES.find((s) => s.id === row.species);
    return {
      id: row.id,
      species: row.species,
      speciesName: species ? species.name : row.species,
      emoji: species ? species.emoji : '🪴',
      nickname: row.nickname,
      note: row.note,
      zone: zoneMeta(zoneIndex.byId.get(row.zone_id)),
      lat: own ? row.lat : coarse(row.lat),
      lng: own ? row.lng : coarse(row.lng),
      photoUrl: `/uploads/${row.photo}`,
      createdAt: row.created_at,
      grower: { username: row.username, displayName: row.display_name },
      mine: !!own,
    };
  }

  // ---------- Session handling ----------
  function setSessionCookie(res, token, maxAgeMs) {
    const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
    if (config.secureCookies) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }
  function startSession(res, userId) {
    const token = newToken();
    const now = Date.now();
    q.insertSession.run(hashToken(token), userId, now, now + config.sessionDays * DAY);
    setSessionCookie(res, token, config.sessionDays * DAY);
  }
  setInterval(() => q.purgeSessions.run(Date.now()), DAY).unref();

  app.use((req, res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    req.user = null;
    if (token && token.length < 100) {
      const u = q.sessionUser.get(hashToken(token), Date.now());
      if (u) req.user = { id: u.id, username: u.username, displayName: u.display_name, role: u.role };
      req.sessionTokenHash = hashToken(token);
    }
    next();
  });
  const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in first' }));

  // ---------- API ----------
  const api = express.Router();
  api.use(rateLimit({ windowMs: 60_000, max: 300 }));
  api.use(csrfGuard);
  api.use(express.json({ limit: '10kb' }));
  api.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20, message: 'Too many sign-in attempts. Try again in a few minutes.' });

  api.post('/auth/register', authLimiter, async (req, res) => {
    const username = cleanText(req.body?.username, 24, { required: true, field: 'Username' });
    const displayName = cleanText(req.body?.displayName, 40, { field: 'Display name' }) || username;
    const password = req.body?.password;
    if (!USERNAME_RE.test(username)) throw bad('Username must be 3–24 letters, numbers or underscores');
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw bad('Password must be at least 8 characters');
    if (password.toLowerCase() === username.toLowerCase()) throw bad('Password must be different from your username');
    if (q.userByName.get(username)) throw new HttpError(409, 'That username is taken');
    const hash = await hashPassword(password);
    let id;
    try {
      id = Number(q.insertUser.run(username, displayName, hash, Date.now()).lastInsertRowid);
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'That username is taken');
      throw err;
    }
    startSession(res, id);
    res.status(201).json({ user: { id, username, displayName, role: 'user' } });
  });

  api.post('/auth/login', authLimiter, async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password || password.length > 200) throw bad('Enter your username and password');
    const user = q.userByName.get(username);
    const ok = user ? await verifyPassword(password, user.password_hash) : await dummyVerify(password);
    if (!ok) throw new HttpError(401, 'Wrong username or password');
    startSession(res, user.id);
    res.json({ user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role } });
  });

  api.post('/auth/logout', (req, res) => {
    if (req.sessionTokenHash) q.deleteSession.run(req.sessionTokenHash);
    setSessionCookie(res, '', 0);
    res.json({ ok: true });
  });

  api.get('/auth/me', (req, res) => {
    if (!req.user) return res.json({ user: null });
    const s = q.myStats.get(req.user.id);
    res.json({ user: { ...req.user, plants: s.plants, zones: s.zones } });
  });

  api.get('/zones', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('ETag', zonesEtag);
    if (req.get('If-None-Match') === zonesEtag) return res.status(304).end();
    res.type('json').send(zonesFile);
  });

  api.get('/species', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({ species: SPECIES });
  });

  function parseLatLng(latRaw, lngRaw) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw bad('Invalid location');
    return { lat, lng };
  }

  api.get('/locate', (req, res) => {
    const { lat, lng } = parseLatLng(req.query.lat, req.query.lng);
    res.json({ zone: zoneMeta(zoneIndex.locate(lng, lat)) });
  });

  api.get('/stats', (req, res) => {
    const zoneCounts = {};
    for (const r of q.zoneCounts.all()) zoneCounts[r.zone_id] = r.n;
    const totals = q.totals.get();
    const greenZones = Object.keys(zoneCounts).length;
    const topZones = Object.entries(zoneCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([id, n]) => ({ ...zoneMeta(zoneIndex.byId.get(id)), plants: n }));
    res.json({
      totalPlants: totals.plants,
      totalGrowers: totals.growers,
      plantsThisWeek: q.plantsThisWeek.get(Date.now() - 7 * DAY).n,
      greenZones,
      totalZones: zoneIndex.all.length,
      zoneCounts,
      topZones,
      topGrowers: q.topGrowers.all().map((g) => ({ username: g.username, displayName: g.display_name, plants: g.plants, zones: g.zones })),
    });
  });

  api.get('/plants', (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const where = ['p.hidden = 0'];
    const params = [];
    if (req.query.zone) {
      if (!zoneIndex.byId.has(String(req.query.zone))) throw bad('Unknown zone');
      where.push('p.zone_id = ?'); params.push(String(req.query.zone));
    }
    if (req.query.before) {
      const before = parseInt(req.query.before, 10);
      if (!Number.isFinite(before)) throw bad('Invalid cursor');
      where.push('p.id < ?'); params.push(before);
    }
    const rows = db.prepare(`${FEED_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT ?`).all(...params, limit + 1);
    const more = rows.length > limit;
    const plants = rows.slice(0, limit).map((r) => serializePlant(r, req.user));
    res.json({ plants, nextCursor: more ? plants[plants.length - 1].id : null });
  });

  api.get('/plants/mine', requireAuth, (req, res) => {
    const rows = db.prepare(`${FEED_SELECT} WHERE p.user_id = ? ORDER BY p.id DESC LIMIT 500`).all(req.user.id);
    res.json({ plants: rows.map((r) => serializePlant(r, req.user)) });
  });

  const uploadLimiter = rateLimit({ windowMs: 60 * 60_000, max: 30, key: (req) => `u${req.user?.id ?? req.ip}`, message: 'You have logged a lot of plants this hour — amazing! Please try again later.' });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 10, fieldSize: 2000, parts: 12 },
  });

  api.post('/plants', requireAuth, uploadLimiter, upload.single('photo'), (req, res) => {
    if (!req.file) throw bad('Please add a photo of your plant');
    const species = cleanText(req.body.species, 40, { required: true, field: 'Plant type' });
    if (!SPECIES_IDS.has(species)) throw bad('Unknown plant type');
    const nickname = cleanText(req.body.nickname, 40, { field: 'Nickname' });
    const note = cleanText(req.body.note, 280, { field: 'Note' });
    const { lat, lng } = parseLatLng(req.body.lat, req.body.lng);
    // The zone is always computed server-side from the coordinates; the client can't choose it.
    const zone = zoneIndex.locate(lng, lat);
    if (!zone) throw bad('That location is outside Kuwait\'s mapped areas. Pick a spot on land inside Kuwait.');

    let image;
    try { image = sanitizeImage(req.file.buffer); } catch { throw bad('Photo must be a valid JPEG, PNG or WebP image'); }
    const filename = `${randomBytes(16).toString('hex')}.${image.type}`;
    const filePath = join(config.uploadDir, filename);
    writeFileSync(filePath, image.data, { mode: 0o644, flag: 'wx' });

    let id;
    try {
      id = Number(q.insertPlant.run(req.user.id, zone.id, species, nickname, note, lat, lng, filename, Date.now()).lastInsertRowid);
    } catch (err) {
      try { unlinkSync(filePath); } catch { /* ignore */ }
      throw err;
    }
    const row = db.prepare(`${FEED_SELECT} WHERE p.id = ?`).get(id);
    res.status(201).json({ plant: serializePlant(row, req.user) });
  });

  api.delete('/plants/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const plant = Number.isFinite(id) ? q.plantById.get(id) : null;
    if (!plant) throw new HttpError(404, 'Plant not found');
    if (plant.user_id !== req.user.id && req.user.role !== 'admin') throw new HttpError(403, 'You can only remove your own plants');
    q.deletePlant.run(id);
    try { unlinkSync(join(config.uploadDir, plant.photo)); } catch { /* already gone */ }
    res.json({ ok: true });
  });

  api.post('/plants/:id/report', requireAuth, rateLimit({ windowMs: 60 * 60_000, max: 20, key: (req) => `r${req.user.id}` }), (req, res) => {
    const id = parseInt(req.params.id, 10);
    const plant = Number.isFinite(id) ? q.plantById.get(id) : null;
    if (!plant) throw new HttpError(404, 'Plant not found');
    if (plant.user_id === req.user.id) throw bad('You can\'t report your own plant');
    const reason = cleanText(req.body?.reason, 200, { field: 'Reason' });
    tx(db, () => {
      const r = q.insertReport.run(id, req.user.id, reason, Date.now());
      if (r.changes) q.bumpReports.run(config.reportsToHide, id);
    });
    res.json({ ok: true });
  });

  api.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', api);

  // ---------- Uploaded photos ----------
  app.use('/uploads', (req, res, next) => {
    if (!/^\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(req.path)) return res.status(404).end();
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    next();
  }, express.static(config.uploadDir, { dotfiles: 'deny', index: false, immutable: true, maxAge: '365d', fallthrough: false }));

  // ---------- Front-end ----------
  app.use(express.static(config.publicDir, {
    index: 'index.html',
    setHeaders(res, path) {
      if (path.endsWith('sw.js') || path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));

  // ---------- Errors ----------
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `Photo is too large (max ${Math.round(config.maxUploadBytes / 1048576)} MB)` : 'Invalid upload';
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: msg });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (err.status === 404 && req.path.startsWith('/uploads')) return res.status(404).end();
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  app.locals.db = db;
  app.locals.config = config;
  return app;
}
