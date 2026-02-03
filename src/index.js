const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;

const app = express();
const PORT = process.env.PORT || 3000;

// yt-dlp binary path (downloads to ./bin on first run)
const BIN_DIR = path.join(__dirname, '..', 'bin');
const BIN_PATH = path.join(
  BIN_DIR,
  process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
);

let ytDlpWrap = null;

async function ensureYtDlp() {
  if (ytDlpWrap) return ytDlpWrap;
  if (fs.existsSync(BIN_PATH)) {
    ytDlpWrap = new YTDlpWrap(BIN_PATH);
    return ytDlpWrap;
  }
  console.log('Downloading yt-dlp...');
  fs.mkdirSync(BIN_DIR, { recursive: true });
  await YTDlpWrap.downloadFromGithub(BIN_PATH, undefined, process.platform);
  ytDlpWrap = new YTDlpWrap(BIN_PATH);
  console.log('yt-dlp ready');
  return ytDlpWrap;
}

// Store pending downloads: token -> { url, title, ext, expiresAt }
const pendingDownloads = new Map();
const TOKEN_EXPIRY_MS = 10 * 60 * 1000;

// Clean expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of pendingDownloads.entries()) {
    if (now > data.expiresAt) pendingDownloads.delete(token);
  }
}, 60 * 1000);

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

app.use(cors());
app.use(express.json());

// Log all API requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl || req.url;
  console.log(`[${timestamp}] ${method} ${url}`);
  next();
});

// Extract video ID from various YouTube URL formats
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&\s]+)/,
    /(?:youtu\.be\/)([^?\s]+)/,
    /(?:youtube\.com\/embed\/)([^?\s]+)/,
    /(?:youtube\.com\/v\/)([^?\s]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// POST /api/process - Accept YouTube URL, return video info and download link
app.post('/api/process', async (req, res) => {
  try {
    const url = req.body?.url ?? req.query?.url;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'YouTube URL is required. Send JSON body: {"url": "https://youtube.com/..."} with header Content-Type: application/json',
      });
    }

    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid YouTube URL',
      });
    }

    const ytdlp = await ensureYtDlp();
    const info = await ytdlp.getVideoInfo(url.trim());

    if (!info || !info.id) {
      return res.status(400).json({
        success: false,
        error: 'Could not fetch video info',
      });
    }

    const token = generateToken();
    const fullUrl = info.webpage_url || `https://www.youtube.com/watch?v=${videoId}`;
    const bestFormat = info.formats?.find((f) => f.vcodec !== 'none' && f.acodec !== 'none')
      || info.formats?.find((f) => f.vcodec !== 'none')
      || info.formats?.[0];
    const ext = bestFormat?.ext || 'mp4';

    pendingDownloads.set(token, {
      url: fullUrl,
      title: info.title || 'video',
      ext,
      expiresAt: Date.now() + TOKEN_EXPIRY_MS,
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const downloadUrl = `${baseUrl}/api/download/${token}`;

    const thumbnails = info.thumbnails || [];
    const thumbnail = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : info.thumbnail;

    res.json({
      success: true,
      videoId: info.id,
      title: info.title,
      duration: info.duration?.toString() || null,
      thumbnail,
      author: info.uploader || info.channel,
      downloadUrl,
      downloadWithFormat: `${baseUrl}/api/download/${token}?format=FORMAT_ID`,
      formats: (info.formats || [])
        .filter((f) => f.vcodec !== 'none' || f.acodec !== 'none')
        .map((f) => ({
          formatId: f.format_id,
          quality: f.height ? `${f.height}p` : (f.format_note || (f.acodec !== 'none' ? 'audio' : 'unknown')),
          container: f.ext,
          hasVideo: f.vcodec !== 'none',
          hasAudio: f.acodec !== 'none',
        })),
    });
  } catch (err) {
    console.error('Process error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to process YouTube URL',
    });
  }
});

// GET /api/download/:token - Stream video to client via yt-dlp
app.get('/api/download/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const data = pendingDownloads.get(token);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Download link expired or invalid',
      });
    }

    if (Date.now() > data.expiresAt) {
      pendingDownloads.delete(token);
      return res.status(410).json({
        success: false,
        error: 'Download link has expired',
      });
    }

    const format = req.query.format || 'best[ext=mp4]/best[ext=webm]/best';
    const ytdlp = await ensureYtDlp();
    const safeTitle = (data.title || 'video').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') || 'video';
    const filename = `${safeTitle}.${data.ext}`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    const stream = ytdlp.execStream([
      data.url,
      '-f', format,
      '--no-warnings',
      '--no-check-certificates',
    ]);

    stream.pipe(res);

    stream.on('error', (err) => {
      console.error('Stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Download failed' });
      } else {
        res.end();
      }
    });
  } catch (err) {
    console.error('Download error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: err.message || 'Download failed',
      });
    }
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

ensureYtDlp()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`VIXO API running at http://localhost:${PORT}`);
      console.log(`Using yt-dlp - https://github.com/yt-dlp/yt-dlp`);
      console.log(`POST /api/process - Send YouTube URL, get download link`);
      console.log(`GET  /api/download/:token - Download video`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize yt-dlp:', err.message);
    process.exit(1);
  });
