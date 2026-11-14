// Builds a static copy of the app in site/ for hosting without the server (e.g. GitHub Pages).
// The app detects there is no API and runs in in-browser demo mode (see public/js/local-api.js).
import { cpSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SPECIES } from '../server/species.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'site');
rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'public'), out, { recursive: true });
mkdirSync(join(out, 'data'), { recursive: true });
copyFileSync(join(root, 'data', 'zones.json'), join(out, 'data', 'zones.json'));
writeFileSync(join(out, 'data', 'species.json'), JSON.stringify({ species: SPECIES }));
writeFileSync(join(out, '.nojekyll'), '');
console.log('Static site written to site/');
