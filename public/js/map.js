// Lightweight SVG map of Kuwait with pan / pinch-zoom, zone colouring and a location pin.
// No tile server needed: zones come from /api/zones (OpenStreetMap boundaries).

const SVG_NS = 'http://www.w3.org/2000/svg';
const LAT0 = 29.3;
const K = Math.cos((LAT0 * Math.PI) / 180);

export function levelFor(count) {
  if (!count) return 0;
  if (count >= 25) return 4;
  if (count >= 10) return 3;
  if (count >= 3) return 2;
  return 1;
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function zoneAt(zones, lng, lat) {
  for (const z of zones) {
    const [a, b, c, d] = z.bbox;
    if (lng < a || lng > c || lat < b || lat > d) continue;
    const polys = z.geometry.type === 'Polygon' ? [z.geometry.coordinates] : z.geometry.coordinates;
    if (polys.some((p) => pointInRing([lng, lat], p[0]) && !p.slice(1).some((h) => pointInRing([lng, lat], h)))) return z;
  }
  return null;
}

export class KuwaitMap {
  constructor(container, zones, { onZoneClick, onPick, pickMode = false, label = 'Map', namer = (z) => z.name } = {}) {
    this.namer = namer;
    this.counts = {};
    this.container = container;
    this.zones = zones;
    this.onZoneClick = onZoneClick;
    this.onPick = onPick;
    this.pickMode = pickMode;
    this.paths = new Map();

    // Fit Kuwait's extent.
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const z of zones) {
      minLng = Math.min(minLng, z.bbox[0]); minLat = Math.min(minLat, z.bbox[1]);
      maxLng = Math.max(maxLng, z.bbox[2]); maxLat = Math.max(maxLat, z.bbox[3]);
    }
    this.origin = { lng: minLng, lat: maxLat };
    this.S = 1000 / ((maxLng - minLng) * K);
    const w = 1000, h = (maxLat - minLat) * this.S;
    const pad = 20;
    this.home = { x: -pad, y: -pad, w: w + pad * 2, h: h + pad * 2 };
    this.vb = { ...this.home };

    this.svg = svgEl('svg', { role: 'img', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' });
    this.g = svgEl('g');
    for (const z of zones) {
      const path = svgEl('path', { d: this.pathFor(z.geometry), class: 'zone lvl-0' });
      path.dataset.id = z.id;
      const title = svgEl('title');
      title.textContent = namer(z);
      path.appendChild(title);
      this.g.appendChild(path);
      this.paths.set(z.id, path);
    }
    this.dotGroup = svgEl('g', { class: 'dots' });
    this.pinGroup = svgEl('g');
    this.svg.append(this.g, this.dotGroup, this.pinGroup);
    container.replaceChildren(this.svg);
    container.tabIndex = 0;
    this.applyViewBox();
    this.bindEvents();
  }

  project(lng, lat) { return [(lng - this.origin.lng) * K * this.S, (this.origin.lat - lat) * this.S]; }
  unproject(x, y) { return [x / (K * this.S) + this.origin.lng, this.origin.lat - y / this.S]; }

  pathFor(geometry) {
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    let d = '';
    for (const poly of polys) for (const ring of poly) {
      ring.forEach(([lng, lat], i) => {
        const [x, y] = this.project(lng, lat);
        d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      });
      d += 'Z';
    }
    return d;
  }

  applyViewBox() {
    const { x, y, w, h } = this.vb;
    this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    // Keep the pin a constant on-screen size.
    const scale = w / this.home.w;
    this.pinGroup.querySelectorAll('[data-r]').forEach((c) => c.setAttribute('r', Number(c.dataset.r) * scale));
    // Dots shrink a little less than the map when zooming in, so they stay visible but don't cover areas.
    const dotR = 4.2 * Math.pow(scale, 0.75);
    this.dotGroup.querySelectorAll('circle').forEach((c) => c.setAttribute('r', dotR));
  }

  // Screen point (client px) -> SVG user coordinates.
  toSvg(clientX, clientY) {
    const pt = this.svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return [0, 0];
    const p = pt.matrixTransform(ctm.inverse());
    return [p.x, p.y];
  }

  zoomAt(factor, cx, cy) {
    const minW = this.home.w / 40;
    const maxW = this.home.w * 1.2;
    const newW = Math.min(maxW, Math.max(minW, this.vb.w / factor));
    const f = newW / this.vb.w;
    this.vb.x = cx - (cx - this.vb.x) * f;
    this.vb.y = cy - (cy - this.vb.y) * f;
    this.vb.w = newW;
    this.vb.h = this.vb.h * f;
    this.clamp();
    this.applyViewBox();
  }
  zoomBy(factor) { this.zoomAt(factor, this.vb.x + this.vb.w / 2, this.vb.y + this.vb.h / 2); }
  reset() { this.vb = { ...this.home }; this.applyViewBox(); }

  clamp() {
    const { home, vb } = this;
    const mx = vb.w * 0.5, my = vb.h * 0.5;
    vb.x = Math.min(home.x + home.w - mx, Math.max(home.x - vb.w + mx, vb.x));
    vb.y = Math.min(home.y + home.h - my, Math.max(home.y - vb.h + my, vb.y));
  }

  focusZone(id, { maxZoom = 12 } = {}) {
    const z = this.zones.find((zz) => zz.id === id);
    if (!z) return;
    const [x1, y1] = this.project(z.bbox[0], z.bbox[3]);
    const [x2, y2] = this.project(z.bbox[2], z.bbox[1]);
    const aspect = this.home.h / this.home.w;
    let w = Math.max((x2 - x1) * 2.2, this.home.w / maxZoom);
    let h = w * aspect;
    if ((y2 - y1) * 2.2 > h) { h = (y2 - y1) * 2.2; w = h / aspect; }
    this.vb = { x: (x1 + x2) / 2 - w / 2, y: (y1 + y2) / 2 - h / 2, w, h };
    this.applyViewBox();
  }

  /** Zoom to a [minLng, minLat, maxLng, maxLat] box. */
  focusBounds([a, b, c, d]) {
    const [x1, y1] = this.project(a, d);
    const [x2, y2] = this.project(c, b);
    const aspect = this.home.h / this.home.w;
    let w = x2 - x1, h = w * aspect;
    if (y2 - y1 > h) { h = y2 - y1; w = h / aspect; }
    this.vb = { x: (x1 + x2) / 2 - w / 2, y: (y1 + y2) / 2 - h / 2, w, h };
    this.applyViewBox();
  }

  /** Change how area names are shown (e.g. after switching language). */
  setNamer(namer) { this.namer = namer; this.setCounts(this.counts); }

  setCounts(counts) {
    this.counts = counts;
    for (const [id, path] of this.paths) {
      const lvl = levelFor(counts[id] || 0);
      path.classList.remove('lvl-0', 'lvl-1', 'lvl-2', 'lvl-3', 'lvl-4');
      path.classList.add(`lvl-${lvl}`);
      const z = this.zones.find((zz) => zz.id === id);
      path.querySelector('title').textContent = `${this.namer(z)} — ${counts[id] || 0}`;
    }
  }

  /** One green dot per planting journey ([lng, lat] pairs, already rounded for privacy). */
  setPoints(points = []) {
    const frag = document.createDocumentFragment();
    const seen = new Map();
    for (const [lng, lat] of points) {
      // Several journeys at the same rounded spot fan out slightly so each one shows.
      const key = `${lng},${lat}`;
      const n = seen.get(key) || 0; seen.set(key, n + 1);
      const angle = n * 2.4, dist = n ? 0.004 * Math.sqrt(n) : 0;
      const [x, y] = this.project(lng + Math.cos(angle) * dist, lat + Math.sin(angle) * dist);
      frag.appendChild(svgEl('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 3, class: 'dot' }));
    }
    this.dotGroup.replaceChildren(frag);
    this.applyViewBox();
  }

  /** Briefly pulse the newest dot (the user's own journey). */
  pulseNewest(lng, lat) {
    const [x, y] = this.project(lng, lat);
    const ring = svgEl('circle', { cx: x, cy: y, r: 6 * (this.vb.w / this.home.w), class: 'dot-ring' });
    this.dotGroup.appendChild(ring);
    setTimeout(() => ring.remove(), 3500);
  }

  highlight(id) {
    this.paths.forEach((p) => p.classList.remove('selected'));
    const p = id && this.paths.get(id);
    if (p) { p.classList.add('selected'); this.g.appendChild(p); } // bring to front so the outline shows
  }

  flash(id) {
    const p = this.paths.get(id);
    if (!p) return;
    p.classList.remove('just-greened');
    void p.getBBox();
    p.classList.add('just-greened');
  }

  setPin(lng, lat) {
    this.pinGroup.replaceChildren();
    if (lng == null) return;
    const [x, y] = this.project(lng, lat);
    const scale = this.vb.w / this.home.w;
    const pulse = svgEl('circle', { cx: x, cy: y, r: 16 * scale, class: 'pin-pulse' });
    pulse.dataset.r = 16;
    const dot = svgEl('circle', { cx: x, cy: y, r: 7 * scale, class: 'pin' });
    dot.dataset.r = 7;
    this.pinGroup.append(pulse, dot);
  }

  bindEvents() {
    const el = this.container;
    const pointers = new Map();
    let start = null; let moved = false; let pinchDist = 0;

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { start = { x: e.clientX, y: e.clientY, vb: { ...this.vb }, target: e.target }; moved = false; }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        moved = true;
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) {
        this.hover(e);
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist) {
          const [cx, cy] = this.toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
          this.zoomAt(d / pinchDist, cx, cy);
        }
        pinchDist = d;
        return;
      }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      el.classList.add('dragging');
      const rect = el.getBoundingClientRect();
      const s = Math.max(start.vb.w / rect.width, start.vb.h / rect.height);
      this.vb.x = start.vb.x - dx * s;
      this.vb.y = start.vb.y - dy * s;
      this.clamp();
      this.applyViewBox();
    });

    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size > 0) return;
      el.classList.remove('dragging');
      if (start && !moved && e.type === 'pointerup') this.tap(e, start.target);
      start = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => this.hideTooltip());

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [cx, cy] = this.toSvg(e.clientX, e.clientY);
      this.zoomAt(e.deltaY < 0 ? 1.25 : 0.8, cx, cy);
    }, { passive: false });

    el.addEventListener('keydown', (e) => {
      const step = this.vb.w * 0.1;
      const actions = {
        '+': () => this.zoomBy(1.4), '=': () => this.zoomBy(1.4), '-': () => this.zoomBy(1 / 1.4),
        ArrowLeft: () => { this.vb.x -= step; }, ArrowRight: () => { this.vb.x += step; },
        ArrowUp: () => { this.vb.y -= step; }, ArrowDown: () => { this.vb.y += step; },
        0: () => this.reset(),
      };
      if (actions[e.key]) { e.preventDefault(); actions[e.key](); this.clamp(); this.applyViewBox(); }
    });
  }

  tap(e, target) {
    if (this.pickMode) {
      const [x, y] = this.toSvg(e.clientX, e.clientY);
      const [lng, lat] = this.unproject(x, y);
      this.onPick?.(lng, lat);
      return;
    }
    const id = target?.dataset?.id;
    if (id) this.onZoneClick?.(id);
  }

  hover(e) {
    if (e.pointerType !== 'mouse') return;
    const id = e.target?.dataset?.id;
    if (!id) return this.hideTooltip();
    const z = this.zones.find((zz) => zz.id === id);
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'map-tooltip';
      this.container.parentElement.appendChild(this.tooltip);
    }
    const rect = this.container.parentElement.getBoundingClientRect();
    this.tooltip.textContent = this.tooltipText ? this.tooltipText(z) : this.namer(z);
    this.tooltip.style.left = `${e.clientX - rect.left}px`;
    this.tooltip.style.top = `${e.clientY - rect.top}px`;
    this.tooltip.hidden = false;
  }
  hideTooltip() { if (this.tooltip) this.tooltip.hidden = true; }
}
