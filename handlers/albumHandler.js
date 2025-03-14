const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const FormData = require('form-data');
const SpottyDL = require('spottydl');

module.exports.startUploadAlbum = async (mainWindow, link, playlist, client, clientUid, session) => {
    try {
        return await SpottyDL.getAlbum(link)
            .then(async(results) => {
              
                let albums;
                let albumData;
                mainWindow.webContents.send('track-data', results);
                albumData = results;
                if (!albumData) {
                  throw new Error(`Не могу получить данные со Spotify, проверьте, включен ли у вас VPN.`);
                }
                albums = await SpottyDL.downloadAlbum(results, path.join(__dirname, '../output'), true);

                if (playlist == 'new') {
                  const newList = await createPlaylist(albumData, client, clientUid, session);
                  playlist = newList.kind;
              }
      
              await albums.forEach(async album => {
                  if (album.status == 'Success') {
                      filename = album.filename.replace(path.join(__dirname, '../output') + '/', "");
                      const filePath = path.resolve(path.join(__dirname, '../output'), filename);
                      await uploadTrack(filename, playlist, filePath, mainWindow, session);
                  }
              });

              return 'Done';
            });

    } catch (error) {
      throw new Error(`${error.message}`);
    }
};


async function createPlaylist(albumData, client, clientUid, session) {
    const playlistName = albumData.artist + ' - ' + albumData.name;

    const newPlaylist = await client.playlists.createPlaylist(client, {title: playlistName, 'visibility': 'public'}).then(async (data) => {
    
        const playlist = data.result;

        await downloadImage(albumData.albumCoverURL);
    
        let data2 = new FormData();
        data2.append('image', fs.createReadStream(path.join(__dirname, '../cover.jpg')));
    
        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://api.music.yandex.ru/users/' + clientUid + '/playlists/' + playlist.kind + '/cover/upload',
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'ru,ru-RU;q=0.9,en-US;q=0.8,en;q=0.7',
                'Connection': 'keep-alive',
                'Cookie': session
            },
            data : data2,
            responseType: 'text'
          };
          
          await axios.request(config)
          .then(async (initialResponse) => {
            if (initialResponse.headers['content-type']?.includes('text/html') ||
                initialResponse.data.startsWith('<!DOCTYPE html') || 
                initialResponse.data.startsWith('<html')) {
                
                throw new Error(`Вылезла капча, не можем её решить, нужно повторно выполнить вход и попробовать заново.`);
            }
          })
          .catch((error) => {
            console.log(error);
          });

        return data.result;
    });

    


      return newPlaylist;
}

async function downloadImage(imageUrl) {
    return await new Promise((resolve, reject) => {
      https.get(imageUrl, (response) => {
        if (response.statusCode === 200) {
          const fileStream = fs.createWriteStream(path.join(__dirname, '../cover.jpg'));
          response.pipe(fileStream);
  
          fileStream.on('finish', () => {
            fileStream.close(() => {
              resolve();
            });
          });
        } else {
          reject(new Error(`Failed to download image: ${response.statusCode}`));
        }
      }).on('error', (err) => {
        reject(err);
      });
    });
  }

  async function uploadTrack(filename, playlist, filePath, mainWindow, session) {
    const params = {
        filename: filename.replace(".mp3", ""),
        path: filename,
        kind: playlist,
        visibility: 'private',
        lang: 'ru',
        'external-domain': 'music.yandex.ru',
        overembed: 'false',
        ncrnd: Math.random().toString()
    };

    const headers = {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'ru,ru-RU;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Cookie': session
    };

    let initialResponse = await axios.get(
        'https://music.yandex.ru/handlers/ugc-upload.jsx',
        { params, headers, responseType: 'text' }
    );

    // Try to parse as JSON
    let responseData;
    try {
        responseData = JSON.parse(initialResponse.data);
    } catch (e) {
        throw new Error(`Вылезла капча, не можем её решить, нужно повторно выполнить вход и попробовать заново.`);
    }

    // Validate required fields
    if (!responseData['post-target'] || !responseData['ugc-track-id']) {
        throw new Error(`Вылезла капча, не можем её решить, нужно повторно выполнить вход и попробовать заново.`);
    }

    const postTarget = responseData['post-target'];

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), {
        filename: filename,
        contentType: 'audio/mpeg'
    });

    const uploadHeaders = {
        ...headers,
        ...form.getHeaders(),
    };

    const uploadResponse = await axios.post(postTarget, form, {
        headers: uploadHeaders,
        onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
        );
        mainWindow.webContents.send('upload-progress', percentCompleted);
        }
    });

    return {
        status: 'success',
        data: uploadResponse.data,
        pollUrl: initialResponse.data['poll-result']
    };
  }