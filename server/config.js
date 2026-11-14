import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(overrides = {}) {
  const env = process.env;
  const isProd = env.NODE_ENV === 'production';
  return {
    root,
    isProd,
    port: Number(env.PORT) || 3000,
    host: env.HOST || '0.0.0.0',
    dbPath: env.DB_PATH || join(root, 'var', 'kuwait-green.db'),
    uploadDir: env.UPLOAD_DIR || join(root, 'var', 'uploads'),
    publicDir: join(root, 'public'),
    zonesPath: join(root, 'data', 'zones.json'),
    // Behind a reverse proxy (nginx, Render, Fly…) set TRUST_PROXY=1 so rate limits see real client IPs.
    trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) || env.TRUST_PROXY : false,
    secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === 'true' : isProd,
    maxUploadBytes: 6 * 1024 * 1024,
    sessionDays: 30,
    reportsToHide: 3,
    ...overrides,
  };
}
