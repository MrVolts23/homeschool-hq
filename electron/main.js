const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

let downloadedUpdateFile = null; // staged update .zip from electron-updater

// Serve the app from a fixed localhost origin (like the Trading Journal does).
// A stable http origin means: localStorage persists across launches, and the
// direct browser → Anthropic API call works (it fails from a file:// origin).
const PORT = 47813;
const APP_ROOT = path.join(__dirname, '..'); // project root (index.html lives here)

let mainWindow = null;
let server = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
        // Resolve safely inside APP_ROOT (no path traversal)
        const filePath = path.normalize(path.join(APP_ROOT, urlPath));
        if (!filePath.startsWith(APP_ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
        fs.readFile(filePath, (err, data) => {
          if (err) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
          res.end(data);
        });
      } catch (e) {
        res.writeHead(500); res.end('Server error');
      }
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve());
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#f6f6f4',
    title: 'Homeschool HQ',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}/index.html`);

  // Open external links (e.g. the Anthropic console) in the system browser, not the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (e) {
    // Port busy or server failed — surface it rather than launching a blank window.
    const { dialog } = require('electron');
    dialog.showErrorBox('Homeschool HQ — startup error', 'Could not start the local server on port ' + PORT + '.\n\n' + e.message);
    app.quit();
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(defaultMenu()));
  createWindow();
  setupUpdater();
});

// ── Auto-updater ──────────────────────────────────────────────────────────────
function setupUpdater() {
  if (!app.isPackaged) return; // only the installed app updates
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    downloadedUpdateFile = info && info.downloadedFile || null;
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update ready',
      message: 'A new version of Homeschool HQ has been downloaded. Restart to apply it.',
      buttons: ['Restart now', 'Later']
    }).then(({ response }) => { if (response === 0) applyUpdateAndRestart(); });
  });
  autoUpdater.on('error', err => console.error('[updater]', err && err.message));

  autoUpdater.checkForUpdates();
  setInterval(() => autoUpdater.checkForUpdates(), 15 * 60 * 1000);
}

// macOS Squirrel refuses to auto-apply updates to UNSIGNED apps, so we swap the
// bundle ourselves: a detached script waits for this process to exit, replaces the
// app, strips quarantine, and relaunches it. (Same approach as the Trading Journal.)
function findStagedZip() {
  if (downloadedUpdateFile && fs.existsSync(downloadedUpdateFile)) return downloadedUpdateFile;
  try {
    const dir = path.join(app.getPath('home'), 'Library/Caches', `${app.getName()}-updater`, 'pending');
    const f = fs.readdirSync(dir).find(n => n.toLowerCase().endsWith('.zip'));
    return f ? path.join(dir, f) : null;
  } catch { return null; }
}

function applyUpdateAndRestart() {
  try {
    const zip = findStagedZip();
    const appPath = path.resolve(process.execPath, '..', '..', '..'); // /Applications/Homeschool HQ.app
    if (!zip || !appPath.endsWith('.app')) { autoUpdater.quitAndInstall(); return; }
    const tmp = path.join(app.getPath('temp'), 'hs-update-extract');
    const script = path.join(app.getPath('temp'), 'hs-apply-update.sh');
    const sh = `#!/bin/bash
APP_PID="$1"; ZIP="$2"; APP_PATH="$3"; TMP="$4"
for i in $(seq 1 120); do kill -0 "$APP_PID" 2>/dev/null || break; sleep 0.5; done
rm -rf "$TMP"; mkdir -p "$TMP"
/usr/bin/ditto -x -k "$ZIP" "$TMP" || exit 1
NEW_APP="$(/usr/bin/find "$TMP" -maxdepth 1 -name '*.app' | head -1)"
if [ -n "$NEW_APP" ]; then
  rm -rf "$APP_PATH"
  /usr/bin/ditto "$NEW_APP" "$APP_PATH"
  /usr/bin/xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true
  /usr/bin/open "$APP_PATH"
fi
rm -rf "$TMP"
`;
    fs.writeFileSync(script, sh, { mode: 0o755 });
    spawn('/bin/bash', [script, String(process.pid), zip, appPath, tmp], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 250);
  } catch (e) {
    console.error('[updater] custom install failed:', e.message);
    try { autoUpdater.quitAndInstall(); } catch (_) {}
  }
}

app.on('activate', () => { if (mainWindow === null) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { try { server && server.close(); } catch (_) {} });

// A standard macOS menu (gives Cmd+Q, copy/paste, reload, etc.).
function defaultMenu() {
  const isMac = process.platform === 'darwin';
  return [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ];
}
