import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';

let server, base, dir;
const H = { 'X-Requested-With': 'KuwaitGreen' };

// A 1x1 JPEG with an EXIF (APP1) segment containing a fake "GPS" marker.
function jpegWithExif() {
  const soi = Buffer.from([0xff, 0xd8]);
  const exifPayload = Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from('GPS-SECRET-29.37,47.97')]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([0, exifPayload.length + 2]), exifPayload]);
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0xff, 0xd9]);
  return Buffer.concat([soi, app0, app1, sos]);
}

async function call(method, path, { body, cookie, headers = {}, form } = {}) {
  const opts = { method, headers: { ...H, ...headers } };
  if (cookie) opts.headers.Cookie = cookie;
  if (form) opts.body = form;
  else if (body) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(base + path, opts);
  const data = await res.json().catch(() => null);
  return { status: res.status, data, res };
}

async function register(username) {
  const r = await call('POST', '/api/auth/register', { body: { username, password: 'correct horse battery', displayName: username } });
  assert.equal(r.status, 201);
  return r.res.headers.get('set-cookie').split(';')[0];
}

function plantForm(extra = {}) {
  const fd = new FormData();
  const { photo, photoBuf, ...rest } = extra;
  const fields = { species: 'sidr', lat: '29.3375', lng: '48.0758', nickname: 'Shady', note: 'Planted with my kids', ...rest };
  for (const [k, v] of Object.entries(fields)) if (v != null) fd.append(k, v);
  if (photo !== null) fd.append('photo', new Blob([photoBuf || jpegWithExif()], { type: 'image/jpeg' }), 'p.jpg');
  return fd;
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kg-test-'));
  const app = createApp(loadConfig({ dbPath: join(dir, 'test.db'), uploadDir: join(dir, 'uploads'), secureCookies: false }));
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

test('serves zones and security headers', async () => {
  const r = await call('GET', '/api/zones');
  assert.equal(r.status, 200);
  assert.equal(r.data.zones.length, 137);
  assert.match(r.res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.res.headers.get('x-powered-by'), null);
});

test('locates a point in Salmiya and rejects the sea / other countries', async () => {
  const salmiya = await call('GET', '/api/locate?lat=29.3375&lng=48.0758');
  assert.equal(salmiya.data.zone.name, 'Salmiya');
  const sea = await call('GET', '/api/locate?lat=29.15&lng=48.35');
  assert.equal(sea.data.zone, null);
  const riyadh = await call('GET', '/api/locate?lat=24.71&lng=46.67');
  assert.equal(riyadh.data.zone, null);
});

test('registration validation and duplicate usernames', async () => {
  assert.equal((await call('POST', '/api/auth/register', { body: { username: 'a', password: 'longenough' } })).status, 400);
  assert.equal((await call('POST', '/api/auth/register', { body: { username: 'bob_ok', password: 'short' } })).status, 400);
  assert.equal((await call('POST', '/api/auth/register', { body: { username: '<script>', password: 'longenough1' } })).status, 400);
  await register('dana');
  assert.equal((await call('POST', '/api/auth/register', { body: { username: 'DANA', password: 'longenough1' } })).status, 409);
});

test('session cookie is HttpOnly and SameSite', async () => {
  const r = await call('POST', '/api/auth/register', { body: { username: 'cookie_check', password: 'longenough1' } });
  const c = r.res.headers.get('set-cookie');
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
});

test('login: wrong password rejected, right password works', async () => {
  await register('fatima');
  assert.equal((await call('POST', '/api/auth/login', { body: { username: 'fatima', password: 'nope-nope-nope' } })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { username: 'ghost', password: 'nope-nope-nope' } })).status, 401);
  const ok = await call('POST', '/api/auth/login', { body: { username: 'fatima', password: 'correct horse battery' } });
  assert.equal(ok.status, 200);
  const me = await call('GET', '/api/auth/me', { cookie: ok.res.headers.get('set-cookie').split(';')[0] });
  assert.equal(me.data.user.username, 'fatima');
});

test('CSRF: state-changing requests need the custom header and same origin', async () => {
  const noHeader = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noHeader.status, 403);
  const evil = await call('POST', '/api/auth/login', { body: {}, headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
});

test('logging a plant: auth required, zone computed server-side, EXIF stripped, coords coarsened publicly', async () => {
  assert.equal((await call('POST', '/api/plants', { form: plantForm() })).status, 401);
  const cookie = await register('ahmad');
  const r = await call('POST', '/api/plants', { cookie, form: plantForm({ zone_id: 'z001-abdali' }) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.plant.zone.name, 'Salmiya');
  assert.equal(r.data.plant.lat, 29.3375); // owner sees exact

  const file = readdirSync(join(dir, 'uploads')).find((f) => r.data.plant.photoUrl.endsWith(f));
  const stored = readFileSync(join(dir, 'uploads', file));
  assert.ok(!stored.includes('GPS-SECRET'), 'EXIF must be removed');
  assert.ok(stored.includes('JFIF'), 'JFIF header kept');

  const photo = await fetch(base + r.data.plant.photoUrl);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');

  const feed = await call('GET', '/api/plants');
  const pub = feed.data.plants.find((p) => p.id === r.data.plant.id);
  assert.equal(pub.lat, 29.34);
  assert.equal(pub.lng, 48.08);
  assert.equal(pub.mine, false);

  const stats = await call('GET', '/api/stats');
  const salmiyaId = r.data.plant.zone.id;
  assert.equal(stats.data.zoneCounts[salmiyaId], 1);
  assert.equal(stats.data.greenZones, 1);
});

test('rejects bad uploads', async () => {
  const cookie = await register('noor');
  const notImage = await call('POST', '/api/plants', { cookie, form: plantForm({ photoBuf: Buffer.from('<?php echo 1; ?> just some text here') }) });
  assert.equal(notImage.status, 400);
  const noPhoto = await call('POST', '/api/plants', { cookie, form: plantForm({ photo: null }) });
  assert.equal(noPhoto.status, 400);
  const badSpecies = await call('POST', '/api/plants', { cookie, form: plantForm({ species: 'unicorn' }) });
  assert.equal(badSpecies.status, 400);
  const outside = await call('POST', '/api/plants', { cookie, form: plantForm({ lat: '24.71', lng: '46.67' }) });
  assert.equal(outside.status, 400);
  const longNote = await call('POST', '/api/plants', { cookie, form: plantForm({ note: 'x'.repeat(500) }) });
  assert.equal(longNote.status, 400);
  const big = await call('POST', '/api/plants', { cookie, form: plantForm({ photoBuf: Buffer.concat([jpegWithExif(), Buffer.alloc(7 * 1024 * 1024)]) }) });
  assert.equal(big.status, 413, JSON.stringify(big.data));
});

test('only the owner can delete; reports hide a post after 3 users', async () => {
  const owner = await register('owner1');
  const { data } = await call('POST', '/api/plants', { cookie: owner, form: plantForm() });
  const id = data.plant.id;
  const other = await register('other1');
  assert.equal((await call('DELETE', `/api/plants/${id}`, { cookie: other })).status, 403);
  assert.equal((await call('POST', `/api/plants/${id}/report`, { cookie: owner, body: {} })).status, 400);
  for (const u of ['rep1', 'rep2', 'rep3']) {
    const c = await register(u);
    assert.equal((await call('POST', `/api/plants/${id}/report`, { cookie: c, body: { reason: 'fake' } })).status, 200);
  }
  const feed = await call('GET', '/api/plants?limit=50');
  assert.ok(!feed.data.plants.some((p) => p.id === id), 'reported plant hidden');
  assert.equal((await call('DELETE', `/api/plants/${id}`, { cookie: owner })).status, 200);
});

test('upload path traversal is blocked', async () => {
  const r = await fetch(`${base}/uploads/..%2f..%2fpackage.json`);
  assert.equal(r.status, 404);
});
