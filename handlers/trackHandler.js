const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const SpottyDL = require('spottydl');

module.exports.startUploadTrack = async (mainWindow, link, playlist, session, spotify) => {
    try {
        let filename;

        await SpottyDL.getTrack(link)
            .then(async(results) => {
                mainWindow.webContents.send('track-data', results);
                let track = await SpottyDL.downloadTrack(results, path.join(__dirname, '../output'), false);
                console.log(track);
                if (track[0].filename) {
                    filename = track[0].filename.replace(path.join(__dirname, '../output') + '/', "");
                } else {
                    throw new Error(`Не могу получить данные со Spotify, проверьте, включен ли у вас VPN.`);
                }
            });

            const filePath = path.resolve(path.join(__dirname, '../output'), filename);
            
            // Validate file exists
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filename}`);
            }

        const params = {
            filename: filename,
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
        
        if (initialResponse.headers['content-type']?.includes('text/html') ||
        initialResponse.data.startsWith('<!DOCTYPE html') || 
        initialResponse.data.startsWith('<html')) {
            throw new Error(`Вылезла капча, не можем её решить, нужно повторно выполнить вход и попробовать заново.`);
        }

        let responseData;
        try {
        responseData = JSON.parse(initialResponse.data);
        } catch (e) {
        throw new Error(`Invalid JSON response: ${initialResponse.data.substring(0, 100)}`);
        }

        if (!responseData['post-target'] || !responseData['ugc-track-id']) {
        throw new Error('Missing required fields in response');
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
    } catch (error) {
      throw new Error(`${error.message}`);
    }
};
