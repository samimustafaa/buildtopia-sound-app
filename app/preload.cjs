'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('soundSwap', {
  checkUpdates: force => ipcRenderer.invoke('check-updates', force === true),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateProgress: callback => {const listener=(_,percent)=>callback(percent);ipcRenderer.on('update-progress',listener);return()=>ipcRenderer.removeListener('update-progress',listener);},
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  connect: folder => ipcRenderer.invoke('connect', folder),
  status: () => ipcRenderer.invoke('status'),
  apply: selected => ipcRenderer.invoke('apply', selected),
  restore: () => ipcRenderer.invoke('restore'),
  importImage: id => ipcRenderer.invoke('import-image', id),
  openBackups: () => ipcRenderer.invoke('open-backups'),
  onProgress: callback => { const listener = (_, text) => callback(text); ipcRenderer.on('progress', listener); return () => ipcRenderer.removeListener('progress', listener); }
});
