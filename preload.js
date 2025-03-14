const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startUpload: (filename, type, playlist) => ipcRenderer.invoke('start-upload', filename, type, playlist),
    relogin: () => ipcRenderer.invoke('relogin'),
    donate: () => ipcRenderer.invoke('donate'),
    getUserPlaylists: () => ipcRenderer.invoke('getUserPlaylists'),
    getFiles: () => ipcRenderer.invoke('getFiles'),
    onUploadProgress: (callback) => {
        ipcRenderer.on('upload-progress', (event, progress) => callback(progress));
    },
    onTrackData: (callback) => {
        ipcRenderer.on('track-data', (event, track) => callback(track));
    }
});