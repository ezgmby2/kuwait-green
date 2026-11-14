// Small, dependency-free geometry helpers (coordinates are [lng, lat]).

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygon(pt, rings) {
  if (!pointInRing(pt, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (pointInRing(pt, rings[k])) return false; // holes
  return true;
}

export function pointInGeometry(pt, geometry) {
  if (geometry.type === 'Polygon') return pointInPolygon(pt, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((p) => pointInPolygon(pt, p));
  return false;
}

// Distance in km between two [lng, lat] points (haversine).
export function distanceKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Kuwait's rough bounding box (with a small margin) — used to reject far-off coordinates fast.
export const KUWAIT_BBOX = { minLng: 46.5, minLat: 28.5, maxLng: 48.5, maxLat: 30.15 };

export function createZoneIndex(zones) {
  const byId = new Map(zones.map((z) => [z.id, z]));
  return {
    byId,
    all: zones,
    /** Returns the zone containing [lng, lat], or null. */
    locate(lng, lat) {
      if (lng < KUWAIT_BBOX.minLng || lng > KUWAIT_BBOX.maxLng || lat < KUWAIT_BBOX.minLat || lat > KUWAIT_BBOX.maxLat) return null;
      for (const z of zones) {
        const [a, b, c, d] = z.bbox;
        if (lng < a || lng > c || lat < b || lat > d) continue;
        if (pointInGeometry([lng, lat], z.geometry)) return z;
      }
      return null;
    },
  };
}
