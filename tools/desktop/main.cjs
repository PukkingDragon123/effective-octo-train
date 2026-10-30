// Electron main process for the desktop build of หลอนยันปลายทาง.
// The game (a Vite build in ./game) is served from the privileged app:// scheme, not file://,
// so module scripts, workers, fetch() of .glb/.json/.mp3 and localStorage all behave as on the web.
// Saves live in userData under the app://game origin.
// Env: DLB_DEVTOOLS=1 enables devtools (F12). DLB_WINDOWED=1 starts windowed.
const { app, BrowserWindow, Menu, ipcMain, protocol, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const TITLE = 'หลอนยันปลายทาง';
const GAME_DIR = path.join(__dirname, 'game');
const DEVTOOLS = !!process.env.DLB_DEVTOOLS;
const ALLOWED_PERMISSIONS = new Set(['pointerLock', 'fullscreen', 'keyboardLock']);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, codeCache: true },
  },
]);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ignore-gpu-blocklist'); // WebGL2 on older but capable GPUs
app.commandLine.appendSwitch('force_high_performance_gpu'); // dual-GPU laptops

/** app://game/<path> -> file in GAME_DIR, with MIME type and byte ranges (media seeking). */
async function serve(request) {
  const url = new URL(request.url);
  let rel;
  try {
    rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const file = path.resolve(GAME_DIR, rel);
  if (url.host !== 'game' || !file.startsWith(GAME_DIR + path.sep)) return new Response('Forbidden', { status: 403 });
  let stat;
  try {
    stat = await fs.promises.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    console.warn(`[app] 404 ${rel}`);
    return new Response('Not found', { status: 404 });
  }
  const headers = {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (range && stat.size > 0) {
    if (range[1]) start = Number(range[1]);
    if (range[2]) end = range[1] ? Math.min(Number(range[2]), end) : stat.size - 1;
    if (!range[1] && range[2]) start = Math.max(0, stat.size - Number(range[2]));
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    status = 206;
  }
  headers['Content-Length'] = String(end - start + 1);
  if (request.method === 'HEAD' || stat.size === 0) return new Response(null, { status, headers });
  return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status, headers });
}

let win = null;

function toggleFullscreen() {
  if (win) win.setFullScreen(!win.isFullScreen());
}

function createWindow() {
  win = new BrowserWindow({
    title: TITLE,
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    fullscreen: !process.env.DLB_WINDOWED,
    backgroundColor: '#050506',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      devTools: DEVTOOLS,
      spellcheck: false,
    },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('closed', () => (win = null));

  const wc = win.webContents;
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) {
      e.preventDefault();
      toggleFullscreen();
    } else if (input.key === 'F12' && DEVTOOLS) {
      e.preventDefault();
      wc.toggleDevTools();
    } else if (process.platform === 'darwin' && input.meta && input.key.toLowerCase() === 'q') {
      e.preventDefault();
      app.quit();
    }
  });
  // The game never navigates away; external links (credits) open in the system browser.
  wc.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://game/')) e.preventDefault();
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('render-process-gone', (_e, d) => console.error('[app] renderer gone:', d.reason));
  wc.on('console-message', (e) => {
    if (e.level === 'error') console.error('[game]', e.message);
  });

  win.loadURL('app://game/index.html');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('window-all-closed', () => app.quit());

  app.whenReady().then(() => {
    // macOS keeps a minimal app menu (Hide, Quit); other platforms have no menu bar.
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }]) : null);
    protocol.handle('app', serve);
    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((_wc, permission, cb) => cb(ALLOWED_PERMISSIONS.has(permission)));
    ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));
    ipcMain.on('dlb:quit', () => app.quit());
    ipcMain.on('dlb:toggle-fullscreen', toggleFullscreen);
    createWindow();
  });
}
