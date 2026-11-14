// Demo data: fake growers and plants so a fresh install shows a partly-green map.
// Used by `npm run seed` and by the desktop app's "Load demo plants" menu item.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { hashPassword } from './security.js';
import { SPECIES } from './species.js';
import { pointInGeometry } from './geo.js';
import { tx } from './db.js';

export const DEMO_PASSWORD = 'plantmore123';

// ---- tiny PNG encoder for placeholder plant pictures ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function plantPng(seed) {
  const W = 400, H = 300;
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const hueShift = rnd() * 40 - 20;
  const leaves = Array.from({ length: 5 + Math.floor(rnd() * 6) }, () => ({ x: 200 + (rnd() - 0.5) * 160, y: 70 + rnd() * 120, r: 22 + rnd() * 30 }));
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      let r, g, b;
      if (y < 220) { const t = y / 220; r = 200 + 40 * t; g = 225 + 15 * t; b = 240 - 20 * t; } // sky
      else { const n = ((x * 7 + y * 13) % 17) / 17; r = 168 + n * 20; g = 122 + n * 14; b = 80; } // soil
      if (Math.abs(x - 200) < 5 && y > 150 && y < 230) { r = 70; g = 110; b = 50; } // stem
      for (const l of leaves) {
        const d = Math.hypot(x - l.x, y - l.y);
        if (d < l.r) { const sh = 1 - d / l.r * 0.35; r = (60 + hueShift) * sh; g = (150 + hueShift) * sh; b = 70 * sh; }
      }
      if (y > 215 && y < 260 && Math.abs(x - 200) < 60 - (y - 215) * 0.3) { r = 190; g = 100; b = 60; } // pot
      const i = y * (W * 3 + 1) + 1 + x * 3;
      raw[i] = Math.max(0, Math.min(255, r)); raw[i + 1] = Math.max(0, Math.min(255, g)); raw[i + 2] = Math.max(0, Math.min(255, b));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function randomPointIn(zone, rnd) {
  const [a, b, c, d] = zone.bbox;
  for (let i = 0; i < 200; i++) {
    const p = [a + (c - a) * rnd(), b + (d - b) * rnd()];
    if (pointInGeometry(p, zone.geometry)) return p;
  }
  return zone.centroid;
}

const growers = [
  ['sara_k', 'سارة'], ['abdullah88', 'عبدالله'], ['green_fahad', 'فهد'], ['noura_plants', 'نورة'],
  ['yousef_q8', 'يوسف'], ['maryam_garden', 'مريم'], ['hamad_trees', 'حمد'], ['lulwa_sidr', 'لولوة'],
];
const hotspots = ['Salmiya', 'Jabriya', 'Rumaithiya', 'Kifan', 'Mishref', 'Bayan', 'Surra', 'Yarmouk', 'Fahaheel', 'Mangaf',
  'Jahra', 'Qortuba', 'Khaldiya', 'Shamiya', 'Dasma', 'Mubarak Al Kabeer', 'Sabah Al-Salem', 'Al Adan', 'Egaila', 'Salwa',
  'Hawalli', 'Abdulla Al-Salem', 'Wafra', 'Failaka Island', 'Sharq', 'Farwaniya', 'Rabiya', 'Andalus'];
const notes = ['زرعتها مع أطفالي هذا الأسبوع 🌱', 'أسقيها كل مساء بعد الغروب', 'هدية من حديقة جدتي',
  'منطقتنا صارت أكثر خضرة!', 'أول تجربة لي — تمنّوا لي التوفيق', null, null, 'ظل للقطط 🐈', 'لشرفة أبرد'];

/** Adds demo growers and 90 plants. Returns { growers, plants, areas }. */
export async function seedDemo(db, { uploadDir, zones }) {
  mkdirSync(uploadDir, { recursive: true });
  const hash = await hashPassword(DEMO_PASSWORD);
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)');
  const getUser = db.prepare('SELECT id FROM users WHERE username = ?');
  const insertPlant = db.prepare('INSERT INTO plants (user_id, zone_id, species, nickname, note, lat, lng, photo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

  const userIds = growers.map(([u, n]) => { insertUser.run(u, n, hash, Date.now() - 40 * 86400000); return getUser.get(u).id; });
  const hotZones = hotspots.map((n) => zones.find((z) => z.name === n)).filter(Boolean);
  const speciesPool = SPECIES.filter((s) => s.id !== 'other');

  let count = 0;
  tx(db, () => { for (let i = 0; i < 90; i++) {
    // Skew towards the first hotspots so a few areas become deep green.
    const zone = hotZones[Math.floor(Math.pow(rnd(), 1.8) * hotZones.length)];
    const [lng, lat] = randomPointIn(zone, rnd);
    const sp = speciesPool[Math.floor(rnd() * speciesPool.length)];
    const file = `${randomBytes(16).toString('hex')}.png`;
    writeFileSync(join(uploadDir, file), plantPng(i * 7919 + 1));
    insertPlant.run(userIds[Math.floor(rnd() * userIds.length)], zone.id, sp.id, null, notes[Math.floor(rnd() * notes.length)],
      lat, lng, file, Date.now() - Math.floor(rnd() * 30 * 86400000));
    count++;
  } });
  return { growers: growers.length, plants: count, areas: hotZones.length };
}
