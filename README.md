# 🪴 Kuwait Green — الكويت خضراء

Grow a plant, snap a photo, and log it. Every plant turns its area of the map from **desert brown** to **green**.
The goal: spread awareness and make Kuwait greener, one plant at a time.

## Features

- **Living map of Kuwait.** All 137 residential and desert areas start brown. They turn deeper green as people log plants (1+, 3+, 10+ and 25+ plants). You can pan and pinch-zoom, tap an area to see its plants, and jump to Kuwait City with one tap.
- **Log a plant in 3 steps.** Take a photo with the camera, pick the plant type, and set the location by GPS, area list or tapping the map.
- **Celebrations.** "You turned Salmiya green! 🎉" when you plant the first plant in an area or move it to a deeper shade.
- **Progress for Kuwait.** "% of Kuwait's areas are green", plant and grower counts, greenest areas, and top growers.
- **Feed** of recent plants, with a filter by area.
- **Learn tab.** Why planting matters in Kuwait, smart watering tips, and a guide to 22 plants suited to Kuwait's climate (Sidr, Ghaf, Arfaj, date palm…).
- **My garden.** Your plants, the areas you've greened, and badges (Seedling → Oasis Maker).
- **English / العربية** with full right-to-left layout, plus a dark mode.
- **Installable app (PWA).** Add it to your home screen. The app shell and map work offline.

## Security & privacy

| Area | What's done |
| --- | --- |
| Passwords | scrypt with a random salt per password, constant-time comparison, and the same login timing whether or not the user exists |
| Sessions | 256-bit random tokens. Only the SHA-256 hash is stored. Cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Sessions expire after 30 days |
| CSRF | SameSite cookie, plus a required `X-Requested-With` header and an `Origin` check on every write request |
| XSS | Strict CSP (`script-src 'self'`, no inline code). The UI builds the page with `textContent` only, never `innerHTML` with user data |
| Uploads | 6 MB limit. File type is checked from the actual bytes, not the file name. Files get random names. **EXIF/GPS metadata is removed** on the server (JPEG/PNG/WebP), and the browser also re-encodes the photo. Photos are served with `nosniff` and a sandboxed CSP |
| Location privacy | The public sees coordinates rounded to about 1 km, and the area name. Only you see your exact pin |
| Integrity | The **server** works out the area from the coordinates, so clients can't pick an area. Coordinates outside Kuwait's land areas are rejected |
| Abuse | Rate limits on API, login and upload. Users can report posts, and a post is hidden after 3 reports. You can delete only your own plants |
| Headers | CSP, HSTS (in production), X-Frame-Options DENY, COOP/CORP, Referrer-Policy, Permissions-Policy |

## Desktop app (no terminal needed)

Download the installer for your computer from the **[Releases page](https://github.com/ezgmby2/kuwait-green/releases/latest)**:

| Your computer | File |
| --- | --- |
| Windows | `Kuwait-Green-…-Windows-Setup.exe` (or `…-Windows-Portable.exe` to run without installing) |
| Mac with Apple chip (M1–M4) | `Kuwait-Green-…-macOS-arm64.dmg` |
| Mac with Intel chip | `Kuwait-Green-…-macOS-x64.dmg` |
| Linux | `Kuwait-Green-…-Linux.AppImage` or `.deb` |

Then double-click it like any other app. Use **Help → Load Demo Plants…** to see the map turn green right away.

### Opening the app the first time

The app isn't code-signed yet (signing certificates cost money), so your computer warns you once:

- **Windows:** "Windows protected your PC" → click **More info → Run anyway**.
- **Mac:** open the app, click **Done** on the warning, then go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**.
- **Linux (AppImage):** right-click → Properties → allow executing as a program, then double-click.

### How the desktop app works

The app starts the Kuwait Green server inside itself, listening only on your computer (`127.0.0.1`), and shows it in its own window.
Your account, plants and photos are saved in your user data folder (**File → Open Data Folder**).
**Each desktop install has its own map.** To have everyone in Kuwait share one map, host the server online (see below).
GPS location may not work in the desktop app; pick your area from the list or tap the map instead.

### Building the installers

Running the **Build desktop apps** workflow (Actions tab → Run workflow) builds all installers and publishes them as a GitHub Release tagged with the version in `package.json`. Bump the version before each new release.
To build on your own machine: `npm run dist` (for the current OS), or `npm run desktop` to run it without packaging.

## Run it as a web server

Requires **Node.js 22.13+**. It uses the built-in `node:sqlite`, so there are no native modules to compile.

```bash
cd kuwait-green
npm install
npm run seed     # optional: demo growers + 90 plants (password: plantmore123)
npm start        # http://localhost:3000
npm test         # API + security tests
```

On a phone, the camera and GPS need **HTTPS** (or `localhost`). Deploy behind HTTPS, or use a tunnel when you test.

### Docker

```bash
docker build -t kuwait-green .
docker run -p 3000:3000 -v kuwait-green-data:/app/var kuwait-green
```

### Configuration (environment variables)

| Var | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | |
| `DB_PATH` | `var/kuwait-green.db` | SQLite file |
| `UPLOAD_DIR` | `var/uploads` | Plant photos |
| `NODE_ENV` | — | `production` turns on Secure cookies and HSTS |
| `TRUST_PROXY` | off | Set to `1` behind nginx, Render, Fly etc. so rate limits see real client IPs |
| `SECURE_COOKIES` | follows `NODE_ENV` | Force `true`/`false` |

## Architecture

```
electron/main.cjs  Desktop app: starts the server on localhost and opens a secure window
public/            Front-end (vanilla JS ES modules, no build step)
  js/map.js        SVG map renderer: projection, pan/pinch-zoom, colouring
  js/app.js        Views, plant logging, auth, celebrations
  js/i18n.js       English/Arabic strings
  sw.js            Offline caching
server/
  app.js           Express routes (REST API under /api)
  db.js            SQLite schema (users, sessions, plants, reports)
  security.js      Password hashing, sessions, CSRF, rate limits, headers
  images.js        Image validation + metadata stripping
  geo.js           Point-in-polygon area lookup
  species.js       Plant guide data
data/zones.json    137 Kuwait areas (generated by scripts/build-zones.mjs)
```

### API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` · `/login` · `/logout` | – | Accounts |
| GET | `/api/auth/me` | – | Current user + their stats |
| GET | `/api/zones` | – | Area shapes (cached, ETag) |
| GET | `/api/stats` | – | Plant count per area, totals, leaderboards |
| GET | `/api/plants?zone=&before=&limit=` | – | Public feed (cursor-paginated) |
| GET | `/api/plants/mine` | ✔ | Your garden |
| POST | `/api/plants` (multipart: `photo`, `species`, `lat`, `lng`, `nickname?`, `note?`) | ✔ | Log a plant |
| DELETE | `/api/plants/:id` | ✔ owner | Remove |
| POST | `/api/plants/:id/report` | ✔ | Report a post |
| GET | `/api/locate?lat=&lng=` | – | Which area a point is in |

### Scaling notes

SQLite and the in-memory rate limiter are a good fit for one server. They handle thousands of users. To run several instances:

- Move to PostgreSQL. The schema is plain SQL.
- Keep rate-limit state in Redis.
- Store photos in S3-compatible object storage behind a CDN.

## Data attribution

Area boundaries © OpenStreetMap contributors, available under the [ODbL](https://opendatacommons.org/licenses/odbl/), via [geoBoundaries](https://www.geoboundaries.org/).
Run `npm run build:zones` to regenerate `data/zones.json` from `data/raw/`.
