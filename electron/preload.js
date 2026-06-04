const { contextBridge, ipcRenderer } = require('electron');

// Safe bridge so the web app can ask the main process to write backups to disk.
contextBridge.exposeInMainWorld('hsBackup', {
  save: (json) => ipcRenderer.invoke('hs-backup-save', json),
  openFolder: () => ipcRenderer.invoke('hs-backup-open')
});
