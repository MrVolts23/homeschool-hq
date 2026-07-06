const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, execFile } = require('child_process');

let downloadedUpdateFile = null; // staged update .zip from electron-updater

// Serve the app from a fixed localhost origin (like the Trading Journal does).
// A stable http origin means: localStorage persists across launches, and the
// direct browser → Anthropic API call works (it fails from a file:// origin).
const PORT = 47813;
const APP_ROOT = path.join(__dirname, '..'); // project root (index.html lives here)

let mainWindow = null;
let server = null;

// Pin the data directory to a FIXED location, independent of the product name.
// The app was first shipped as "Homeschool HQ" with userData at .../homeschool-hq;
// renaming the product must NOT move (and thus orphan) the user's saved data, so we
// lock userData here before the app is ready. All worksheets, grades, the API key,
// and grade-image files live under this folder and stay put across renames.
try { app.setPath('userData', path.join(app.getPath('appData'), 'homeschool-hq')); } catch (e) { /* best-effort */ }

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
        // Serve saved completed-worksheet images from the app's data folder.
        if (urlPath.startsWith('/_gradeimg/')) {
          const name = path.basename(urlPath); // strip any path components for safety
          const imgPath = path.join(gradeImagesDir(), name);
          fs.readFile(imgPath, (err, data) => {
            if (err) { res.writeHead(404); res.end('Not found'); return; }
            res.writeHead(200, { 'Content-Type': 'image/jpeg' });
            res.end(data);
          });
          return;
        }
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
    title: 'SOVRN Homeschool HQ',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
    dialog.showErrorBox('SOVRN Homeschool HQ — startup error', 'Could not start the local server on port ' + PORT + '.\n\n' + e.message);
    app.quit();
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(defaultMenu()));
  registerBackupHandlers();
  createWindow();
  setupUpdater();
});

// ── Auto-backup ───────────────────────────────────────────────────────────────
// The renderer sends its full state JSON; we write a timestamped copy to
// ~/Documents/Homeschool HQ Backups/ and keep the most recent 30. This means the
// data is recoverable even if localStorage is ever lost/corrupted/cleared.
function backupsDir() { return path.join(app.getPath('documents'), 'Homeschool HQ Backups'); }

function writeBackup(json) {
  try {
    if (!json || typeof json !== 'string') return { ok: false, error: 'empty' };
    const dir = backupsDir();
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(dir, `homeschool-backup-${ts}.json`), json, 'utf8');
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('homeschool-backup-') && f.endsWith('.json'))
      .sort();
    while (files.length > 30) { try { fs.unlinkSync(path.join(dir, files.shift())); } catch (_) {} }
    return { ok: true };
  } catch (e) {
    console.error('[backup]', e.message);
    return { ok: false, error: e.message };
  }
}

// Saved completed-worksheet photos live in the data folder (survives updates),
// not in localStorage — keeps the data store small.
function gradeImagesDir() { return path.join(app.getPath('userData'), 'grade-images'); }

function writeGradeImage(id, dataUrl) {
  try {
    if (!id || !dataUrl) return { ok: false, error: 'missing' };
    const m = String(dataUrl).match(/^data:image\/[^;]+;base64,(.+)$/);
    if (!m) return { ok: false, error: 'bad data url' };
    const dir = gradeImagesDir();
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(id).replace(/[^a-zA-Z0-9_-]/g, '') + '.jpg';
    fs.writeFileSync(path.join(dir, safe), Buffer.from(m[1], 'base64'));
    return { ok: true, file: safe };
  } catch (e) {
    console.error('[gradeimg]', e.message);
    return { ok: false, error: e.message };
  }
}

// iPhone photos are HEIC, which Chromium can't decode and the Claude vision API
// won't accept. macOS ships `sips`, so convert HEIC→JPEG (downscaled) on the fly.
function heicToJpeg(srcPath) {
  return new Promise((resolve) => {
    try {
      if (!srcPath || !fs.existsSync(srcPath)) return resolve({ ok: false, error: 'file not found' });
      const out = path.join(app.getPath('temp'), 'hs-heic-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.jpg');
      execFile('/usr/bin/sips', ['-s', 'format', 'jpeg', '-Z', '1600', srcPath, '--out', out], (err) => {
        if (err) return resolve({ ok: false, error: err.message });
        fs.readFile(out, (e2, data) => {
          try { fs.unlinkSync(out); } catch (_) {}
          if (e2) return resolve({ ok: false, error: e2.message });
          resolve({ ok: true, dataUrl: 'data:image/jpeg;base64,' + data.toString('base64') });
        });
      });
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
}

function registerBackupHandlers() {
  // Synchronous version lookup so the renderer can show the running build at load.
  ipcMain.on('hs-app-version', (e) => { e.returnValue = app.getVersion(); });
  ipcMain.handle('hs-heic-to-jpeg', (_e, srcPath) => heicToJpeg(srcPath));
  ipcMain.handle('hs-backup-save', (_e, json) => writeBackup(json));
  ipcMain.handle('hs-backup-open', () => {
    const d = backupsDir();
    try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
    shell.openPath(d);
    return true;
  });
  ipcMain.handle('hs-gradeimg-save', (_e, id, dataUrl) => writeGradeImage(id, dataUrl));
}

// ── Auto-updater ──────────────────────────────────────────────────────────────
// This app is UNSIGNED, so macOS Squirrel can't apply updates itself. We download
// via electron-updater and swap the bundle with our own script. Every step is
// logged to updater.log in the data folder — a *silent* swap failure is exactly
// what caused the old "update prompt loop" (app re-prompts forever because the
// install never actually lands), so nothing here is allowed to fail quietly.
const UPDATER_LOG = path.join(app.getPath('userData'), 'updater.log');
function ulog(...parts) {
  const line = `[${new Date().toISOString()}] ` +
    parts.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ') + '\n';
  try { fs.appendFileSync(UPDATER_LOG, line); } catch (_) {}
  try { console.log('[updater]', ...parts); } catch (_) {}
}
function openReleasesPage() {
  shell.openExternal('https://github.com/MrVolts23/homeschool-hq/releases/latest');
}

function setupUpdater() {
  if (!app.isPackaged) return; // only the installed app updates
  autoUpdater.autoDownload = true;
  // Keep this OFF. For an unsigned mac app the built-in on-quit install is a no-op
  // that fails silently — the app relaunches at the OLD version and re-prompts on
  // an endless loop. We install the swap ourselves instead.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = {
    info: (m) => ulog('info', m), warn: (m) => ulog('warn', m),
    error: (m) => ulog('error', m), debug: () => {}
  };

  autoUpdater.on('update-available', (info) => ulog('update-available', info && info.version, 'current', app.getVersion()));
  autoUpdater.on('update-not-available', () => ulog('up to date', app.getVersion()));
  autoUpdater.on('download-progress', (p) => ulog('downloading', (p && Math.round(p.percent)) + '%'));
  autoUpdater.on('update-downloaded', (info) => {
    downloadedUpdateFile = (info && info.downloadedFile) || null;
    ulog('update-downloaded', info && info.version, 'file', downloadedUpdateFile);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update ready',
      message: `SOVRN Homeschool HQ ${info && info.version ? info.version + ' ' : ''}is ready. Restart to apply it.`,
      buttons: ['Restart now', 'Later'],
      defaultId: 0, cancelId: 1
    }).then(({ response }) => { if (response === 0) applyUpdateAndRestart(); });
  });
  autoUpdater.on('error', err => ulog('ERROR', err && (err.stack || err.message || String(err))));

  autoUpdater.checkForUpdates().catch(e => ulog('checkForUpdates threw', e && e.message));
  setInterval(() => { autoUpdater.checkForUpdates().catch(e => ulog('recheck threw', e && e.message)); }, 15 * 60 * 1000);
}

function findStagedZip() {
  if (downloadedUpdateFile && fs.existsSync(downloadedUpdateFile)) return downloadedUpdateFile;
  try {
    const dir = path.join(app.getPath('home'), 'Library/Caches', `${app.getName()}-updater`, 'pending');
    const f = fs.readdirSync(dir).find(n => n.toLowerCase().endsWith('.zip'));
    return f ? path.join(dir, f) : null;
  } catch { return null; }
}

// Swap the bundle ourselves. Safety rule: the running app is deleted ONLY after
// the new bundle has been extracted, copied to a sibling, and validated — so a
// bad/partial download can never leave the user with no app. Rolls forward only.
function applyUpdateAndRestart() {
  const zip = findStagedZip();
  const appPath = path.resolve(process.execPath, '..', '..', '..'); // /Applications/SOVRN Homeschool HQ.app
  ulog('applyUpdate zip=', zip, 'appPath=', appPath);

  // No usable download → be honest and point at the manual download. NEVER a
  // silent no-op (that's what looped before).
  if (!zip || !appPath.endsWith('.app')) {
    ulog('no staged zip or non-.app path — offering manual download');
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Couldn’t auto-install',
      message: 'The update downloaded but couldn’t be installed automatically. I’ll open the download page — drag the new app into Applications to finish updating.',
      buttons: ['Open download page', 'Cancel'], defaultId: 0, cancelId: 1
    }).then(({ response }) => { if (response === 0) openReleasesPage(); });
    return;
  }

  try {
    const tmp = path.join(app.getPath('temp'), 'hs-update-extract');
    const script = path.join(app.getPath('temp'), 'hs-apply-update.sh');
    const sh = `#!/bin/bash
set -u
APP_PID="$1"; ZIP="$2"; APP_PATH="$3"; TMP="$4"; LOG="$5"
log(){ echo "[$(date -u +%FT%TZ)] swap: $*" >> "$LOG" 2>/dev/null; }
log "start pid=$APP_PID zip=$ZIP"
for i in $(seq 1 120); do kill -0 "$APP_PID" 2>/dev/null || break; sleep 0.5; done
rm -rf "$TMP"; mkdir -p "$TMP"
if ! /usr/bin/ditto -x -k "$ZIP" "$TMP"; then log "ERROR unzip failed — reopening old app"; /usr/bin/open "$APP_PATH"; exit 1; fi
NEW_APP="$(/usr/bin/find "$TMP" -maxdepth 1 -name '*.app' | head -1)"
if [ -z "$NEW_APP" ] || [ ! -f "$NEW_APP/Contents/Info.plist" ]; then log "ERROR no valid .app in zip — reopening old app"; /usr/bin/open "$APP_PATH"; exit 1; fi
STAGE="$APP_PATH.new"
rm -rf "$STAGE"
if ! /usr/bin/ditto "$NEW_APP" "$STAGE"; then log "ERROR stage copy failed — reopening old app"; rm -rf "$STAGE"; /usr/bin/open "$APP_PATH"; exit 1; fi
if [ ! -f "$STAGE/Contents/Info.plist" ]; then log "ERROR staged bundle invalid — reopening old app"; rm -rf "$STAGE"; /usr/bin/open "$APP_PATH"; exit 1; fi
# New bundle staged + validated. Only now do we remove the old app.
rm -rf "$APP_PATH"
if ! mv "$STAGE" "$APP_PATH"; then log "ERROR final move failed — launching staged copy"; /usr/bin/open "$STAGE"; exit 1; fi
/usr/bin/xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true
rm -rf "$TMP"
log "OK -> $APP_PATH"
/usr/bin/open "$APP_PATH"
`;
    fs.writeFileSync(script, sh, { mode: 0o755 });
    ulog('spawning swap script');
    spawn('/bin/bash', [script, String(process.pid), zip, appPath, tmp, UPDATER_LOG], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 250);
  } catch (e) {
    ulog('applyUpdate exception', e && e.message);
    dialog.showMessageBox(mainWindow, {
      type: 'warning', title: 'Update failed',
      message: 'The update couldn’t be installed automatically. Open the download page to update manually?',
      buttons: ['Open download page', 'Cancel'], defaultId: 0, cancelId: 1
    }).then(({ response }) => { if (response === 0) openReleasesPage(); });
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
