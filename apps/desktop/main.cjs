const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');

app.setName('Sunto');
const devUrl = !app.isPackaged ? process.env.SUNTO_DEV_URL : undefined;
if (devUrl && devUrl !== 'http://127.0.0.1:5173') throw new Error('Unexpected development URL');

function createWindow() {
  const win = new BrowserWindow({
    width: 1180, height: 850, minWidth: 390, minHeight: 600,
    backgroundColor: '#ffffff', title: 'Sunto',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.on('did-fail-load', (_event, code, description) => console.error('Renderer failed:', code, description));
  if (process.argv.includes('--smoke-test')) {
    win.webContents.once('did-finish-load', async () => {
      try {
        const result = await win.webContents.executeJavaScript(`({ title: document.title, heading: document.querySelector('h1')?.textContent, node: typeof window.require, process: typeof window.process, platform: window.sunto?.platform })`);
        console.log(JSON.stringify(result));
        if (result.title !== 'Sunto' || result.heading !== 'Inbox' || result.node !== 'undefined' || result.process !== 'undefined' || result.platform !== 'macos') throw new Error('Desktop smoke check failed');
        app.exit(0);
      } catch (error) { console.error(error); app.exit(1); }
    });
    setTimeout(() => app.exit(1), 20000).unref();
  }
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(app.isPackaged ? path.join(__dirname, 'renderer/index.html') : path.join(__dirname, '../../packages/app/dist/index.html'));
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
