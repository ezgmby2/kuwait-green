// Arfaj (عرفج) desktop app.
// Starts the Arfaj server inside the app (listening on this computer only) and shows it in a window.
// Your plants, photos and account are stored in your user data folder, e.g.
//   Windows: %APPDATA%\Arfaj   macOS: ~/Library/Application Support/Arfaj   Linux: ~/.config/Arfaj
const { app, BrowserWindow, Menu, shell, dialog, session } = require('electron');
const path = require('node:path');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const { readFileSync } = require('node:fs');

const ROOT = path.join(__dirname, '..');
const PREFERRED_PORT = 47390; // fixed so your sign-in and language choice survive restarts
const REPO_URL = 'https://github.com/ezgmby2/kuwait-green';

let mainWindow = null;
let server = null;
let expressApp = null;
let baseUrl = null;
let config = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function startServer() {
  const load = (f) => import(pathToFileURL(path.join(ROOT, 'server', f)).href);
  const [{ loadConfig }, { createApp }] = await Promise.all([load('config.js'), load('app.js')]);

  const port = (await portIsFree(PREFERRED_PORT)) ? PREFERRED_PORT : 0;
  const dataDir = app.getPath('userData');
  // Filled in once the real port is known; until then every request is refused.
  const allowedHosts = [];
  config = loadConfig({
    dbPath: path.join(dataDir, 'kuwait-green.db'),
    uploadDir: path.join(dataDir, 'uploads'),
    host: '127.0.0.1',
    isProd: false,
    secureCookies: false, // plain http on localhost
    trustProxy: false,
    allowedHosts,
  });
  expressApp = createApp(config);

  await new Promise((resolve, reject) => {
    server = expressApp.listen(port, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  const actualPort = server.address().port;
  allowedHosts.push(`127.0.0.1:${actualPort}`, `localhost:${actualPort}`);
  baseUrl = `http://127.0.0.1:${actualPort}`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 860,
    minWidth: 380,
    minHeight: 600,
    title: 'عرفج | ARFAJ',
    backgroundColor: '#f7f1e6',
    icon: path.join(ROOT, 'build', 'icon.png'),
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // Keep the window on our own pages; open any outside link in the normal browser.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(baseUrl)) {
      e.preventDefault();
      if (/^https:\/\//.test(url)) shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(`${baseUrl}/#map`);
}

function setupPermissions() {
  // Only our own page may ask for location or camera; everything else is refused.
  const allowed = new Set(['geolocation', 'media', 'notifications', 'clipboard-sanitized-write']);
  const isOurs = (url) => typeof url === 'string' && url.startsWith(baseUrl);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    cb(allowed.has(permission) && isOurs(details.requestingUrl || wc.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => allowed.has(permission) && isOurs(origin));
}

async function loadDemoData() {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Add demo journeys', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    title: 'Load demo journeys',
    message: 'Add 90 demo planting journeys from 8 demo growers?',
    detail: 'This shows how the map turns green. Demo growers sign in with the password "plantmore123". Your own plants are kept.',
  });
  if (response !== 0) return;
  try {
    const { seedDemo } = await import(pathToFileURL(path.join(ROOT, 'server', 'demo.js')).href);
    const { zones } = JSON.parse(readFileSync(config.zonesPath, 'utf8'));
    const r = await seedDemo(expressApp.locals.db, { uploadDir: config.uploadDir, zones });
    mainWindow?.webContents.reload();
    dialog.showMessageBox(mainWindow, { type: 'info', message: `Added ${r.plants} plants across ${r.areas} areas. 🌱` });
  } catch (err) {
    dialog.showErrorBox('Could not add demo plants', String(err.message || err));
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ label: 'Open Data Folder', click: () => shell.openPath(app.getPath('userData')) }, { type: 'separator' }, isMac ? { role: 'close' } : { role: 'quit' }] },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Load Demo Journeys…', click: loadDemoData },
        { type: 'separator' },
        { label: 'Arfaj on GitHub', click: () => shell.openExternal(REPO_URL) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (err) {
    dialog.showErrorBox('Arfaj could not start', String(err.stack || err));
    app.quit();
    return;
  }
  setupPermissions();
  buildMenu();
  createWindow();
  app.on('activate', () => { if (!mainWindow) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('before-quit', () => {
  try { server?.close(); expressApp?.locals.db.close(); } catch { /* shutting down anyway */ }
});
