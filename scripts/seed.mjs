// Fills the database with demo growers and plants so you can see the map turn green.
// Usage: npm run seed   (demo accounts use the password "plantmore123")
import { readFileSync } from 'node:fs';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { seedDemo, DEMO_PASSWORD } from '../server/demo.js';

const config = loadConfig();
const db = openDb(config.dbPath);
const { zones } = JSON.parse(readFileSync(config.zonesPath, 'utf8'));
const r = await seedDemo(db, { uploadDir: config.uploadDir, zones });
console.log(`Seeded ${r.growers} growers and ${r.plants} plants across ${r.areas} areas. Demo password: ${DEMO_PASSWORD}`);
