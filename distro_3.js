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
