const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Add any Electron-specific APIs here if needed
  platform: process.platform,
  isElectron: true,
  
  // Example: Send message to main process
  sendMessage: (message) => ipcRenderer.send('message', message),
  
  // Example: Receive message from main process
  onMessage: (callback) => {
    ipcRenderer.on('message', callback);
  }
});

// Remove any existing listeners when the window is closed
window.addEventListener('beforeunload', () => {
  ipcRenderer.removeAllListeners('message');
}); 