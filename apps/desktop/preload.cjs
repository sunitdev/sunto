const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'sunto',
  Object.freeze({
    platform: 'macos',
    request: (/** @type {{command: string, data?: string}} */ options) =>
      ipcRenderer.invoke('sunto:storage', options),
  }),
);
