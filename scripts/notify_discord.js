const { execSync } = require('child_process');
const fs = require('fs');
const https = require('https');

const webhookUrl = process.env.DISCORD_WEBHOOK;
const prAuthor = process.env.PR_AUTHOR || 'Unknown';
const prLink = process.env.PR_LINK || '';
const prNumber = process.env.PR_NUMBER || '';

if (!webhookUrl) {
  console.error('ERROR: DISCORD_WEBHOOK environment variable is not set in GitHub Secrets! Please add it to Settings -> Secrets and variables -> Actions.');
  process.exit(1);
}

function getAddedSongs() {
  try {
    // Get music.json content before the merge (HEAD^1)
    const beforeContent = execSync('git show HEAD^1:music.json').toString();
    const beforeData = JSON.parse(beforeContent);
    const beforeSongs = new Set(beforeData.items.map(item => `${item.song.toLowerCase()}|${item.artist.toLowerCase()}`));

    // Get current music.json content
    const afterContent = fs.readFileSync('music.json', 'utf8');
    const afterData = JSON.parse(afterContent);

    return afterData.items.filter(item => {
      const key = `${item.song.toLowerCase()}|${item.artist.toLowerCase()}`;
      return !beforeSongs.has(key);
    });
  } catch (err) {
    console.error('ERROR parsing music.json or git diff:', err.message);
    console.error('Make sure actions/checkout has fetch-depth: 2');
    process.exit(1);
  }
}

const addedSongs = getAddedSongs();
if (addedSongs.length === 0) {
  console.log('No new songs added in music.json. Skipping notification.');
  process.exit(0);
}

// Build plain-text message without any emojis
let content = '';
if (addedSongs.length === 1) {
  const song = addedSongs[0];
  const searchUrl = `https://lossless.echomusic.fun/?search=${encodeURIComponent(song.song)}`;
  content = `New Lossless Track Added

Contributor: ${prAuthor}
Song: ${song.song} by ${song.artist}
Song Link: ${searchUrl}
Pull Request: ${prLink}`;
} else {
  let songList = '';
  addedSongs.forEach(song => {
    const searchUrl = `https://lossless.echomusic.fun/?search=${encodeURIComponent(song.song)}`;
    songList += `- ${song.song} by ${song.artist}\n  Link: ${searchUrl}\n`;
  });

  content = `New Lossless Tracks Added

Contributor: ${prAuthor}
Pull Request: ${prLink}

Songs:
${songList}`;
}

const payload = {
  content: content
};

const payloadString = JSON.stringify(payload);

const urlObj = new URL(webhookUrl);
const options = {
  hostname: urlObj.hostname,
  path: urlObj.pathname + urlObj.search,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payloadString)
  }
};

const req = https.request(options, (res) => {
  console.log(`Discord webhook response status: ${res.statusCode}`);
  let responseData = '';
  res.on('data', (d) => {
    responseData += d;
  });
  res.on('end', () => {
    console.log('Response data:', responseData);
    console.log('Notification sent successfully.');
  });
});

req.on('error', (e) => {
  console.error('Failed to send Discord webhook:', e);
});

req.write(payloadString);
req.end();
