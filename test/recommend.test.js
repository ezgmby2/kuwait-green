import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendPlants } from '../public/js/recommend.js';
import { SPECIES } from '../server/species.js';

const SPACES = ['small', 'medium', 'large'];
const PLACES = ['balcony', 'roof', 'ground', 'indoor'];
const SUNS = ['full', 'partial', 'shade'];

test('always returns exactly 3 different plants for every combination and month', () => {
  for (const space of SPACES) for (const place of PLACES) for (const sun of SUNS) for (let m = 1; m <= 12; m++) {
    const r = recommendPlants(SPECIES, { space, place, sun }, m);
    assert.equal(r.length, 3, `${space}/${place}/${sun}/${m}`);
    assert.equal(new Set(r.map((x) => x.species.id)).size, 3);
    assert.ok(!r.some((x) => x.species.id === 'other'));
  }
});

test('indoor + shade suggests indoor plants, not trees', () => {
  const ids = recommendPlants(SPECIES, { space: 'small', place: 'indoor', sun: 'shade' }, 11).map((x) => x.species.id);
  assert.ok(ids.includes('pothos') && ids.includes('snake-plant'), ids.join());
  assert.ok(!ids.includes('date-palm') && !ids.includes('ghaf'));
});

test('big sunny garden in November favours in-season desert trees', () => {
  const r = recommendPlants(SPECIES, { space: 'large', place: 'ground', sun: 'full' }, 11);
  const ids = r.map((x) => x.species.id);
  assert.ok(ids.some((id) => ['sidr', 'ghaf', 'acacia', 'tamarix'].includes(id)), ids.join());
  assert.ok(r.every((x) => x.reasons.includes('whySeason')));
});

test('season matters: tomato is suggested for a sunny balcony in November but not in July', () => {
  const nov = recommendPlants(SPECIES, { space: 'small', place: 'balcony', sun: 'full' }, 11).map((x) => x.species.id);
  const jul = recommendPlants(SPECIES, { space: 'small', place: 'balcony', sun: 'full' }, 7).map((x) => x.species.id);
  assert.ok(nov.includes('tomato') || nov.includes('arfaj') || nov.includes('rosemary'), nov.join());
  assert.ok(!jul.includes('tomato'), jul.join());
});
