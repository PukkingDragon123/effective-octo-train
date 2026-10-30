// Exposes a tiny desktop bridge to the game page (sandboxed, context-isolated).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dlbDesktop', {
  isDesktop: true,
  quit: () => ipcRenderer.send('dlb:quit'),
  toggleFullscreen: () => ipcRenderer.send('dlb:toggle-fullscreen'),
});
