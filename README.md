# VIXO API

Node.js backend that processes YouTube URLs and returns download links for your frontend app.

## Setup

```bash
npm install
```

## Run

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

Server runs at `http://localhost:3000` by default. Set `PORT` env var to change.

## API

### POST `/api/process`

Send a YouTube URL to get video info and a download link.

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

**Response:**
```json
{
  "success": true,
  "videoId": "VIDEO_ID",
  "title": "Video Title",
  "duration": "123",
  "thumbnail": "https://...",
  "author": "Channel Name",
  "downloadUrl": "http://localhost:3000/api/download/abc123xyz",
  "formats": [...]
}
```

### GET `/api/download/:token`

Use the `downloadUrl` from the process response. Triggers a file download. Token expires after 10 minutes.

**Format selection** – add `?format=FORMAT_ID` to choose quality:

- `?format=140` – 140p mp4 (video only)
- `?format=248` – 480p webm
- `?format=251` – audio only (opus/webm)
- `?format=bestaudio` – best audio
- `?format=best` – best quality (default)

Use the `formatId` from the `formats` array in the process response.

### GET `/api/health`

Health check endpoint.

## Frontend Example

```javascript
// 1. Send YouTube URL
const res = await fetch('http://localhost:3000/api/process', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
});
const data = await res.json();

// 2. Use download link
if (data.success) {
  window.location.href = data.downloadUrl;  // or <a href={data.downloadUrl}>Download</a>
}
```

## Supported URL Formats

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`
