const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const { YandexMusicClient } = require('yandex-music-client/YandexMusicClient');

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const SpottyDL = require('spottydl')
const trackHandler = require('./handlers/trackHandler');
const albumHandler = require('./handlers/albumHandler');
const playlistHandler = require('./handlers/playlistHandler');
const Store = require('electron-store');

const db = new Store();

const URL_WITH_ACCESS_TOKEN_REGEX = 'https:\\/\\/music\\.yandex\\.(?:ru|com|by|kz|ua)\\/#access_token=([^&]*)';
const token = db.get('token');

let client;
let clientUid = 0;

if (token) {
    client = new YandexMusicClient({
        BASE: "https://api.music.yandex.net:443",
        HEADERS: {
            'Authorization': `OAuth ${token}`,
            'Accept-Language': 'ru'
          },
      });
    
      client.account.getAccountStatus().then(async ({result}) => {
        clientUid = result.account.uid;
      });
}

let mainWindow;

function createLogin() {
    mainWindow = new BrowserWindow({
      width: 350,
      height: 450,
      frame: false,
      hasShadow: false,
      resizable: false,
      icon: path.join(__dirname, 'favicon.png'),
    })
  
    // and load the index.html of the app.
    mainWindow.loadURL('https://spotya.ru/login.html')
  
    mainWindow.webContents.session.clearStorageData();


    mainWindow.on('closed', function () {
      // Dereference the window object
      mainWindow = null
    })
  
  }

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 950,
        height: 700,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color: '#fa905c',
          symbolColor: '#FFFFFF',
          height: 30,
        },
        icon: path.join(__dirname, 'favicon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile('renderer.html');
}

app.whenReady().then(() => {

    if (token) {
        createWindow();
    } else {
        createLogin();
        app.on('web-contents-created', (event, contents) => {

            contents.on('will-navigate', (event, navigationUrl) => {
        
                const match = navigationUrl.match(URL_WITH_ACCESS_TOKEN_REGEX);
                if (match) {
                    db.set('token', match[1]);
                }

                if (navigationUrl.includes('music')) {
                    session.defaultSession.cookies.get({ url: 'https://music.yandex.ru' })
                    .then((cookies) => {
                        db.set('session_id', convertCookiesToHeaderString(cookies));
                        const sessionIdCookie = cookies.find(cookie => cookie.name === 'Session_id');
                        if (sessionIdCookie) {
                            app.relaunch();
                            app.quit();
                        } else {
                            console.log('Session_id Cookie not found.');
                        }
                    }).catch((error) => {
                        console.log(error)
                    });

                }
            })
        })
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});


ipcMain.handle('start-upload', async (event, link, type, playlist) => {
    try {

      let result;
      await deleteFilesInDirectory(path.join(__dirname, '/output'));

      if (type == 'track') {
        result = await trackHandler.startUploadTrack(mainWindow, link, playlist, db.get('session_id'));
      } else if (type == 'album') {
        result = await albumHandler.startUploadAlbum(mainWindow, link, playlist, client, clientUid, db.get('session_id'));
      } else if (type == 'playlist') {
        result = await playlistHandler.startUploadPlaylist(mainWindow, link, playlist, client, clientUid, db.get('session_id'));
      }

      return result;
      } catch (error) {
        throw new Error(`${error.message}`);
      }
      
});

ipcMain.handle('relogin', async () => {
  try {

    db.delete('token');
    db.delete('session_id');

    app.relaunch();
    app.quit();

    } catch (error) {
      throw new Error(`${error.message}`);
    }
    
});

ipcMain.handle('donate', async () => {
  try {

    shell.openExternal("https://spotya.ru/donate.php");

    } catch (error) {
      throw new Error(`${error.message}`);
    }
    
});

ipcMain.handle('getUserPlaylists', async (event) => {
    let userPlaylists = [];

    userPlaylists = await client.playlists.getPlayLists(client, clientUid).then((data) => {
    
        data.result.forEach((element) => {
          userPlaylists.push({ title: element.title, uid: element.uid, kind: element.kind });
        });

      return userPlaylists;
    });

    return userPlaylists;
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});


ipcMain.handle('getFiles', async (event) => {

  const files = await listFilesInDirectory(path.join(__dirname, '/output'));

  return files;
});

function convertCookiesToHeaderString(cookies) {
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
}

function listFilesInDirectory(dir) {
  return new Promise((resolve, reject) => {
    fs.readdir(dir, (err, files) => {
      if (err) {
        console.error('Error reading directory:', err);
        reject(err);
      } else {
        const filesWithoutExt = files.map(file => path.basename(file, path.extname(file)));

        resolve(filesWithoutExt);
      }
    });
  });
}

async function deleteFilesInDirectory(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    }
    console.log('All files deleted from', dir);
  } catch (err) {
    console.error('Error deleting files:', err);
  }
}