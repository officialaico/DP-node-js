const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const Jimp = require('jimp');
const app = express();
const PORT = 3000;

app.use(bodyParser.json());

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '/')));

// Endpoint to serve the final JSON data
app.get('/data', (req, res) => {
    res.sendFile(path.join(__dirname, 'trending_music_final.json'));
});

// Endpoint to serve the trending JSON data
app.get('/trending_music.json', (req, res) => {
    res.sendFile(path.join(__dirname, 'trending_music.json'));
});

// Endpoint to serve the notes JSON data
app.get('/notes.json', (req, res) => {
    const notesPath = path.join(__dirname, 'notes.json');
    if (!fs.existsSync(notesPath)) {
        fs.writeFileSync(notesPath, JSON.stringify({ notes: [] }));
    }
    res.sendFile(notesPath);
});

// Endpoint to save a note
app.post('/save-note', (req, res) => {
    const { title, content } = req.body;
    const notesPath = path.join(__dirname, 'notes.json');
    let notesData = { notes: [] };

    if (fs.existsSync(notesPath)) {
        notesData = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
    }

    const existingNote = notesData.notes.find(note => note.title === title);
    if (existingNote) {
        existingNote.content = content;
    } else {
        notesData.notes.push({ title, content });
    }

    fs.writeFileSync(notesPath, JSON.stringify(notesData, null, 2));
    res.json({ message: 'Note saved successfully' });
});

// Function to scrape data (from scrape_1.js)
async function scrapeData() {
    const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

// Function to set up the Puppeteer browser
async function setupBrowser() {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--window-size=1920,1080']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    return { browser, page };
}

// Function to search page source for dynamic class names
async function searchDynamicClassNames(page, pattern) {
    const pageSource = await page.content();
    const matches = [...pageSource.matchAll(new RegExp(pattern, 'g'))];
    const classNames = [...new Set(matches.map(match => match[1]))];
    return classNames;
}

// Function to decode base64 image data
async function decodeBase64Image(dataUrl) {
    const buffer = Buffer.from(dataUrl, 'base64');
    const image = await Jimp.read(buffer);
    return image;
}

// Function to extract graph values from image
async function extractGraphValues(image) {
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    const values = [];

    for (let i = 0; i < 7; i++) {
        let x = Math.floor(i * (width / 6));
        x = x >= width ? width - 1 : x;
        let redPixels = [];
        for (let y = 0; y < height; y++) {
            const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
            if (pixel.r > 150 && pixel.g < 100 && pixel.b < 100) {
                redPixels.push(y);
            }
        }
        if (redPixels.length > 0) {
            const midPixel = redPixels[Math.floor(redPixels.length / 2)];
            values.push(1 - (midPixel / height));
        } else {
            values.push(0);
        }
    }

    values.reverse();
    return values;
}

// Function to extract hashtags using dynamic class names
async function extractHashtags(page, hashtagClass, retries = 3) {
    let hashtags = [];
    let retryCount = 0;

    while (hashtags.length < 10 && retryCount < retries) {
        let elementsFound = false;
        const startTime = Date.now();

        while (!elementsFound && (Date.now() - startTime < 10000)) {
            const hashtagElements = await page.$$(hashtagClass);
            if (hashtagElements.length > 0) {
                elementsFound = true;
            }
        }

        if (!elementsFound) {
            retryCount++;
            console.log(`No hashtag elements found. Reloading page... (Attempt ${retryCount}/${retries})`);
            await page.reload();
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
        }

        const hashtagElements = await page.$$(hashtagClass);
        for (let element of hashtagElements) {
            const hashtag = await page.evaluate(el => el.textContent.trim(), element);
            if (!hashtags.includes(hashtag)) {
                hashtags.push(hashtag);
                if (hashtags.length >= 500) {
                    break;
                }
            }
        }

        try {
            const viewMoreButton = await page.$('.CcButton_common__aFDas.CcButton_secondary__N1HnA.index-mobile_common__E86XM');
            if (viewMoreButton) {
                await viewMoreButton.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                throw new Error("No more 'View More' buttons found");
            }
        } catch (e) {
            console.log("No more 'View More' buttons or an error occurred:", e);
            break;
        }
    }

    return hashtags.slice(0, 500);
}

// Function to scrape music data and graphs using dynamic class names
async function scrapeMusicAndGraphs(page, musicClass, authorClass, graphClass, retries = 3) {
    let musicData = [];
    let retryCount = 0;

    while (musicData.length < 500 && retryCount < retries) {
        let elementsFound = false;
        const startTime = Date.now();

        while (!elementsFound && (Date.now() - startTime < 10000)) {
            const musicElements = await page.$$(musicClass);
            const authorElements = await page.$$(authorClass);
            const graphElements = await page.$$(graphClass + ' canvas');

            if (musicElements.length > 0 && authorElements.length > 0 && graphElements.length > 0) {
                elementsFound = true;
            }
        }

        if (!elementsFound) {
            retryCount++;
            console.log(`No music elements found. Reloading page... (Attempt ${retryCount}/${retries})`);
            await page.reload();
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
        }

        const musicElements = await page.$$(musicClass);
        const authorElements = await page.$$(authorClass);
        const graphElements = await page.$$(graphClass + ' canvas');

        if (musicElements.length !== authorElements.length || musicElements.length !== graphElements.length) {
            console.log("Mismatch between number of music elements, author elements, and graph elements.");
            return musicData;
        }

        for (let i = 0; i < musicElements.length; i++) {
            const musicTitle = await page.evaluate(el => el.textContent.trim(), musicElements[i]);
            const authorName = await page.evaluate(el => el.textContent.trim(), authorElements[i]);
            const graphDataUrl = await page.evaluate(canvas => canvas.toDataURL('image/png').substring(22), graphElements[i]);

            const graphImage = await decodeBase64Image(graphDataUrl);
            const graphValues = await extractGraphValues(graphImage);

            // console.log(`Graph values for "${musicTitle}" by "${authorName}":`, graphValues); // Debug log

            const musicItem = {
                title: musicTitle,
                author: authorName,
                graph_values: graphValues
            };
            if (!musicData.some(item => item.title === musicTitle && item.author === authorName)) {
                musicData.push(musicItem);
                if (musicData.length >= 500) {
                    break;
                }
            }
        }

        try {
            const viewMoreButton = await page.$('.CcButton_common__aFDas.CcButton_secondary__N1HnA.index-mobile_common__E86XM');
            if (viewMoreButton) {
                await viewMoreButton.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                throw new Error("No more 'View More' buttons found");
            }
        } catch (e) {
            console.log("No more 'View More' buttons or an error occurred:", e);
            break;
        }
    }

    return musicData.slice(0, 500);
}

// Function to save data to a JSON file with a timestamp
function saveToJson(data, filename) {
    const timestamp = new Date().toISOString();
    const result = {
        timestamp,
        data
    };
    fs.writeFileSync(path.resolve(__dirname, filename), JSON.stringify(result, null, 4), 'utf8');
}

// Main function for scraping hashtags and music data
(async () => {
    const { browser, page } = await setupBrowser();
    const retries = 3;

    // Scrape hashtags
    let hashtagData = [];
    let retryCount = 0;

    while (hashtagData.length === 0 && retryCount < retries) {
        await page.goto('https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en');
        await new Promise(resolve => setTimeout(resolve, 10000));

        const hashtagClassPattern = /class="([^"]*CardPc_titleText[^"]*)"/g;
        const hashtagClassNames = await searchDynamicClassNames(page, hashtagClassPattern);

        if (hashtagClassNames.length > 0) {
            const hashtagClass = '.' + hashtagClassNames[0].split(' ').join('.');
            console.log(`Using hashtag class: ${hashtagClass}`);
            hashtagData = await extractHashtags(page, hashtagClass);
        } else {
            retryCount++;
            console.log(`Failed to identify dynamic class names for hashtags. Reloading page... (Attempt ${retryCount}/${retries})`);
            await page.reload();
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    console.log(`Scraped ${hashtagData.length} hashtags.`);
    if (hashtagData.length > 0) {
        saveToJson(hashtagData, 'trending_hashtags.json');
        console.log("Hashtag data saved to 'trending_hashtags.json'");
    }

    // Scrape music data and graphs
    let musicData = [];
    retryCount = 0;

    while (musicData.length === 0 && retryCount < retries) {
        await page.goto('https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en');
        await new Promise(resolve => setTimeout(resolve, 10000));

        const musicClassPattern = /class="([^"]*ItemCard_musicName[^"]*)"/g;
        const authorClassPattern = /class="([^"]*ItemCard_autherName[^"]*)"/g;
        const graphClassPattern = /class="([^"]*ItemCard_echartWrap[^"]*)"/g;

        const musicClassNames = await searchDynamicClassNames(page, musicClassPattern);
        const authorClassNames = await searchDynamicClassNames(page, authorClassPattern);
        const graphClassNames = await searchDynamicClassNames(page, graphClassPattern);

        if (musicClassNames.length > 0 && authorClassNames.length > 0 && graphClassNames.length > 0) {
            const musicClass = '.' + musicClassNames[0].split(' ').join('.');
            const authorClass = '.' + authorClassNames[0].split(' ').join('.');
            const graphClass = '.' + graphClassNames[0].split(' ').join('.');
            console.log(`Using music class: ${musicClass}`);
            console.log(`Using author class: ${authorClass}`);
            console.log(`Using graph class: ${graphClass}`);

            musicData = await scrapeMusicAndGraphs(page, musicClass, authorClass, graphClass);
        } else {
            retryCount++;
            console.log(`Failed to identify dynamic class names for music, author, and graphs. Reloading page... (Attempt ${retryCount}/${retries})`);
            await page.reload();
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    console.log(`Scraped ${musicData.length} music items with graphs.`);
    if (musicData.length > 0) {
        saveToJson(musicData, 'trending_music.json');
        console.log("Music data saved to 'trending_music.json'");
    }

    // Close the browser
    await browser.close();
})();

}

// Function to extract features (from features_2.js)
async function extractFeatures() {
    require('dotenv').config();
const Spotify = require('node-spotify-api');
const fs = require('fs');

// Your Spotify API credentials from .env file
const spotify = new Spotify({
  id: process.env.SPOTIFY_CLIENT_ID,
  secret: process.env.SPOTIFY_CLIENT_SECRET
});

// Function to get track ID from Spotify
async function getTrackId(spotify, trackName, artistName) {
  const result = await spotify.search({ type: 'track', query: `track:${trackName} artist:${artistName}` });
  if (result.tracks.items.length) {
    return result.tracks.items[0].id;
  }
  return null;
}

// Function to get audio features from Spotify
async function getFeatures(spotify, trackId) {
    try {
      const response = await spotify.request(`https://api.spotify.com/v1/audio-features/${trackId}`);
      return response;
    } catch (error) {
      console.error('Failed to retrieve audio features:', error);
      return null;
    }
  }
  

// Load trending music data
fs.readFile('trending_music.json', 'utf-8', async (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
    return;
  }
  const trendingMusic = JSON.parse(data);
  trendingMusic.timestamp = new Date().toISOString();

  // Fetch and add features to each track
  for (const track of trendingMusic.data) {
    const trackId = await getTrackId(spotify, track.title, track.author);
    if (trackId) {
      const features = await getFeatures(spotify, trackId);
      if (features) {
        Object.assign(track, {
          acousticness: features.acousticness,
          danceability: features.danceability,
          energy: features.energy,
          instrumentalness: features.instrumentalness,
          liveness: features.liveness,
          speechiness: features.speechiness,
          valence: features.valence
        });
      }
    }
  }

  // Save updated data to new JSON file
  fs.writeFile('trending_music_with_features.json', JSON.stringify(trendingMusic, null, 4), 'utf-8', err => {
    if (err) {
      console.error('Error writing file:', err);
      return;
    }
    console.log('Updated trending music with features saved to trending_music_with_features.json');
  });
});

}

// Function to process distribution (from distro_3.js)
async function processDistribution() {
    const fs = require('fs');
const axios = require('axios');
const { DateTime } = require('luxon'); // For datetime handling similar to Python's datetime

require('dotenv').config(); // Load environment variables from a .env file

// Constants
const BING_VIDEO_SEARCH_API_URL = "https://api.bing.microsoft.com/v7.0/videos/search";
const API_KEY = process.env.API_KEY; // Load the API key from environment variables


async function performBingVideoSearch(query) {
    const headers = { "Ocp-Apim-Subscription-Key": API_KEY };
    const params = { q: query, count: 5 };
    try {
        const response = await axios.get(BING_VIDEO_SEARCH_API_URL, { headers, params });
        return response.data;
    } catch (e) {
        console.error(`Error during Bing video search: ${e}`);
        return {};
    }
}

function extractVideoDescriptions(bingResponse) {
    const descriptions = [];
    try {
        const videoResults = bingResponse.value || [];
        videoResults.forEach(video => {
            const description = video.description.trim();
            descriptions.push(description);
        });
    } catch (e) {
        console.error(`Error extracting video descriptions: ${e}`);
    }
    return descriptions;
}



async function main() {
    ensureFilesExist();
    
    const trendingMusic = readJSONFile('trending_music_with_features.json').data || [];
    const processedSongs = readJSONFile('processed_songs.json');
    const videoDescriptions = readJSONFile('video_descriptions.json');

    const videoDescriptionsDict = Object.fromEntries(videoDescriptions.map(entry => [entry.query, entry.descriptions]));
    const results = [];

    for (const song of trendingMusic) {
        const query = `${song.title} ${song.author} Topic site:youtube.com`;
        if (processedSongs[query]) {
            console.log(`Skipping already processed song: ${query}`);
            descriptions = videoDescriptionsDict[query] || [];
        } else {
            console.log(`Searching for: ${query}`);
            const bingResponse = await performBingVideoSearch(query);
            const descriptions = extractVideoDescriptions(bingResponse);
            videoDescriptions.push({ query, descriptions });
            videoDescriptionsDict[query] = descriptions;
            processedSongs[query] = true;
        }

        const distrokid = descriptions.some(description => description.includes("DistroKid"));
        const songData = {
            title: song.title,
            author: song.author,
            distrokid,
            ...song.features
        };
        results.push(songData);
    }

    saveData('trending_music_final.json', { timestamp: DateTime.now().toISO(), data: results });
    saveData('video_descriptions.json', videoDescriptions);
    saveData('processed_songs.json', processedSongs);
}

function ensureFilesExist() {
    if (!fs.existsSync('processed_songs.json')) {
        fs.writeFileSync('processed_songs.json', JSON.stringify({}), 'utf-8');
    }
    if (!fs.existsSync('video_descriptions.json')) {
        fs.writeFileSync('video_descriptions.json', JSON.stringify([]), 'utf-8');
    }
}

function readJSONFile(filename) {
    try {
        const data = fs.readFileSync(filename, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error(`Error reading file ${filename}: ${e}`);
        return e.code === 'ENOENT' ? {} : [];
    }
}

function saveData(filename, data) {
    fs.writeFileSync(filename, JSON.stringify(data, null, 4), 'utf-8');
}

// Running the main function
main();

}

// Function to run all steps sequentially
async function runAllScripts() {
    await scrapeData();
    await extractFeatures();
    await processDistribution();
}

// Endpoint to run the scripts
app.get('/run-script', async (req, res) => {
    try {
        await runAllScripts();
        res.json({ message: 'All scripts executed successfully' });
    } catch (error) {
        console.error('Error running scripts:', error);
        res.status(500).json({ message: 'Error running scripts' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
