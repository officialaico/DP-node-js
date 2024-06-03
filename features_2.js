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
