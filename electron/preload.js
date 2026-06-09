const { contextBridge, ipcRenderer } = require('electron');

// Safe bridge so the web app can ask the main process to write backups to disk.
contextBridge.exposeInMainWorld('hsBackup', {
  save: (json) => ipcRenderer.invoke('hs-backup-save', json),
  openFolder: () => ipcRenderer.invoke('hs-backup-open'),
  saveGradeImage: (id, dataUrl) => ipcRenderer.invoke('hs-gradeimg-save', id, dataUrl),
  heicToJpeg: (srcPath) => ipcRenderer.invoke('hs-heic-to-jpeg', srcPath)
});

// Expose the running app version (read synchronously at load) so the UI can show
// exactly which build is running — confirming it's the Mac app, not a browser.
let __appVersion = '';
try { __appVersion = ipcRenderer.sendSync('hs-app-version'); } catch (e) { /* not in Electron */ }
contextBridge.exposeInMainWorld('hsApp', { version: __appVersion });
