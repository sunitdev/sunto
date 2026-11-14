const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('sunto', Object.freeze({ platform: 'macos' }));
