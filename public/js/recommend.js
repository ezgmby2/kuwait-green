// "Start planting" recommendations: picks the 3 plants that best fit the user's space, place, sun and
// the current Kuwaiti season. Pure function — shared by the browser and the tests.

/**
 * @param {Array} species  plant list from /api/species
 * @param {{space:'small'|'medium'|'large', place:'balcony'|'roof'|'ground'|'indoor', sun:'full'|'partial'|'shade'}} input
 * @param {number} month   1–12 (defaults to the current month)
 * @returns {Array<{species, score, reasons: string[]}>} top 3, best first; reasons are i18n keys
 */
export function recommendPlants(species, { space, place, sun }, month = new Date().getMonth() + 1) {
  const candidates = species.filter((s) => s.plantMonths && s.plantMonths.length);
  const scored = candidates.map((s) => {
    let score = 0;
    const reasons = [];
    const fitsPlace = s.places.includes(place);
    const fitsSun = s.sun.includes(sun);
    const fitsSpace = s.spaces.includes(space) || (space === 'large' && s.spaces.includes('medium')) || (space === 'medium' && s.spaces.includes('small'));
    const inSeason = s.plantMonths.includes(month);
    // Hard requirements count most; a plant that can't live in the place/sun the user has is a poor pick.
    if (fitsPlace) { score += 40; reasons.push(`whyPlace_${place}`); }
    if (fitsSun) { score += 30; reasons.push(`whySun_${sun}`); }
    if (fitsSpace) { score += 20; reasons.push(`whySpace_${space}`); }
    if (inSeason) { score += 25; reasons.push('whySeason'); }
    if (s.native) { score += 8; reasons.push('whyNative'); }
    if (s.heat === 3) { score += 5; reasons.push('whyHeat'); }
    if (s.waterDays >= 7) { score += 4; reasons.push('whyLowWater'); }
    // Exact space match beats "fits in a bigger space".
    if (s.spaces.includes(space)) score += 6;
    return { species: s, score, reasons, fitsPlace, fitsSun };
  });
  scored.sort((a, b) => b.score - a.score || a.species.waterDays - b.species.waterDays);
  // Prefer plants that satisfy both place and sun; fall back to the best of the rest so there are always 3.
  const strong = scored.filter((x) => x.fitsPlace && x.fitsSun);
  const picks = [...strong, ...scored.filter((x) => !strong.includes(x))].slice(0, 3);
  return picks.map(({ species: s, score, reasons }) => ({ species: s, score, reasons }));
}

/** Kuwait seasons, for the "season now" label. */
export function seasonFor(month) {
  if ([12, 1, 2].includes(month)) return 'winter';
  if ([3, 4, 5].includes(month)) return 'spring';
  if ([6, 7, 8, 9].includes(month)) return 'summer';
  return 'autumn';
}
