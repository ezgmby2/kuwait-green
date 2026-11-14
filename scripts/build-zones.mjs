// Builds data/zones.json from the geoBoundaries (OpenStreetMap, ODbL) Kuwait files.
// Run: npm run build:zones
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pointInGeometry } from '../server/geo.js';
import { AREAS_AR, GOVERNORATES_AR } from './zone-names-ar.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const adm1 = JSON.parse(readFileSync(join(root, 'data/raw/adm1.json'), 'utf8'));
const adm2 = JSON.parse(readFileSync(join(root, 'data/raw/adm2.json'), 'utf8'));

const GOV_NAMES = {
  'Ahmadi': 'Al Ahmadi',
  'Al Asimah': 'Capital',
  'Farwaniya': 'Al Farwaniyah',
  'Hawalli': 'Hawalli',
  'Jahra': 'Al Jahra',
  'Mubarak Al-Kabeer': 'Mubarak Al-Kabeer',
};

// Fix spelling / formatting of the raw OSM names so they read naturally.
const NAME_FIXES = {
  'Suwaikh_Industrail-1': 'Shuwaikh Industrial 1',
  'Suwaikh_Industrial-2': 'Shuwaikh Industrial 2',
  'Suwaikh_Industrial-3': 'Shuwaikh Industrial 3',
  'Suwaikh_Educational': 'Shuwaikh Educational',
  'Suwaikh_Port': 'Shuwaikh Port',
  'Suwaikh_Commercial': 'Shuwaikh Commercial',
  'Suwaikh': 'Shuwaikh',
  'Shuwaikh_Health': 'Shuwaikh Health',
  'Jleeb_Al- Shiyoukh': 'Jleeb Al-Shuyoukh',
  'West_Jleedb': 'West Jleeb',
  'Elahmdi': 'Al Ahmadi',
  'Bar_Elahmadi': 'Ahmadi Desert',
  'Bar Jahra': 'Jahra Desert',
  'UmAl-Hayman-AliSabahAs-Salem': 'Ali Sabah Al-Salem (Umm Al-Hayman)',
  'MubarakAlAbdullah_MishriftWest': 'Mubarak Al-Abdullah (West Mishref)',
  'Bnaid_Al-QR': 'Bneid Al-Gar',
  'Elwafra': 'Wafra',
  'Elwafra_Elgededa': 'New Wafra',
  'Elkeran_Elgededa': 'New Khairan',
  'El_Kehran_Loloet_Elkheran': 'Khairan (Pearl City)',
  'El_Noyseep': 'Nuwaiseeb',
  'El_Zoor': 'Al Zour',
  'Elnahda_Shark_Elsolybekhat': 'Nahda (East Sulaibikhat)',
  'Makaber_Elsolybekhat': 'Sulaibikhat Cemetery',
  'Sad_Elabdallah': 'Saad Al-Abdullah',
  'Fylaka': 'Failaka Island',
  'Saba_Elahmad': 'Sabah Al-Ahmad',
  'Abo_Elhaseena': 'Abu Al-Hasaniya',
  'Sebak_Al_Hegen': 'Sabah Al-Salem Hejen',
  'Ashbelya': 'Ishbiliya',
  'Ghornata': 'Granada',
  'Andalous': 'Andalus',
  'Angafa': 'Ungaifa',
  'Shuhada': 'Shuhada',
  'Mishrift': 'Mishref',
  'Riggai': 'Reggae',
};

// Coastal areas whose centroid falls just outside the simplified governorate shapes.
const GOV_OVERRIDES = { 'Shuwaikh Port': 'Capital' };

function prettify(raw) {
  if (NAME_FIXES[raw]) return NAME_FIXES[raw];
  return raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

const round = (n) => Math.round(n * 1e4) / 1e4; // ~11 m precision

function roundGeom(g) {
  const ring = (r) => {
    const out = [];
    for (const [x, y] of r) {
      const p = [round(x), round(y)];
      const last = out[out.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
    }
    return out;
  };
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.coordinates.map(ring) };
  return { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map(ring)) };
}

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return a / 2;
}

function centroidOf(g) {
  // Area-weighted centroid of the largest polygon's outer ring.
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let best = null, bestA = -1;
  for (const p of polys) { const a = Math.abs(ringArea(p[0])); if (a > bestA) { bestA = a; best = p[0]; } }
  let cx = 0, cy = 0, A = 0;
  for (let i = 0, j = best.length - 1; i < best.length; j = i++) {
    const f = best[j][0] * best[i][1] - best[i][0] * best[j][1];
    cx += (best[j][0] + best[i][0]) * f; cy += (best[j][1] + best[i][1]) * f; A += f;
  }
  A /= 2;
  return [round(cx / (6 * A)), round(cy / (6 * A))];
}

function bboxOf(g) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const p of polys) for (const [x, y] of p[0]) {
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  }
  return b.map(round);
}

function areaKm2(g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let a = 0;
  for (const p of polys) {
    const lat = p[0][0][1] * Math.PI / 180;
    a += Math.abs(ringArea(p[0])) * 111.32 * 111.32 * Math.cos(lat);
  }
  return Math.round(a * 10) / 10;
}

// A point guaranteed to be inside the zone (the centroid of a concave shape can fall outside it).
// Scan horizontal lines across the shape and take the middle of the widest inside segment.
function labelPoint(g, centroid, bbox) {
  const c = centroid.map(round);
  if (pointInGeometry(c, g)) return c;
  const rings = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat();
  let best = c, bestW = -1;
  for (let k = 1; k < 100; k++) {
    const y = bbox[1] + (bbox[3] - bbox[1]) * k / 100;
    const xs = [];
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y)) xs.push(xi + (y - yi) * (xj - xi) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const p = [round((xs[i] + xs[i + 1]) / 2), round(y)];
      if (xs[i + 1] - xs[i] > bestW && pointInGeometry(p, g)) { bestW = xs[i + 1] - xs[i]; best = p; }
    }
  }
  return best;
}

const seen = new Map();
const zones = adm2.features.map((f, i) => {
  const geometry = roundGeom(f.geometry);
  const centroid = centroidOf(geometry);
  const gov = adm1.features.find((g) => pointInGeometry(centroid, g.geometry));
  let name = prettify(f.properties.shapeName);
  const n = (seen.get(name) || 0) + 1; seen.set(name, n);
  if (n > 1) name = `${name} ${n}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const bbox = bboxOf(geometry);
  const label = labelPoint(geometry, centroid, bbox);
  return {
    id: `z${String(i + 1).padStart(3, '0')}-${slug}`,
    name,
    nameAr: AREAS_AR[name] || name,
    governorate: GOV_OVERRIDES[name] || (gov ? GOV_NAMES[gov.properties.shapeName] : 'Kuwait'),
    centroid: label,
    bbox,
    areaKm2: areaKm2(geometry),
    geometry,
  };
}).sort((a, b) => a.name.localeCompare(b.name));

const out = {
  attribution: 'Area boundaries © OpenStreetMap contributors (ODbL), via geoBoundaries',
  attributionAr: 'حدود المناطق © مساهمو OpenStreetMap ‏(ODbL)، عبر geoBoundaries',
  zones,
};
for (const z of zones) z.governorateAr = GOVERNORATES_AR[z.governorate] || z.governorate;
const noAr = zones.filter((z) => !AREAS_AR[z.name]).map((z) => z.name);
if (noAr.length) console.log('Zones with no Arabic name:', noAr.join(', '));
writeFileSync(join(root, 'data/zones.json'), JSON.stringify(out));
console.log(`Wrote ${zones.length} zones`);
const missing = zones.filter((z) => z.governorate === 'Kuwait').map((z) => z.name);
if (missing.length) console.log('Zones with no governorate match:', missing.join(', '));
