# VIXO API – Integration Guide

YouTube download API. Send a YouTube URL, receive video metadata and a download link.

**Base URL:** `http://localhost:3000` (or your deployed URL)

---

## Endpoints

### 1. Health Check

Check if the API is running.

| Method | Endpoint | Description |
|--------|----------|--------------|
| GET | `/api/health` | Returns API status |

**Request**
```http
GET /api/health
```

**Response**
```json
{
  "status": "ok",
  "timestamp": "2026-02-03T12:00:00.000Z"
}
```

---

### 2. Process YouTube URL

Send a YouTube URL to get video metadata and a download link.

| Method | Endpoint | Description |
|--------|----------|--------------|
| POST | `/api/process` | Process URL, return info + download link |

**Request**
```http
POST /api/process
Content-Type: application/json

{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

**Query parameter (alternative)**
```http
POST /api/process?url=https://www.youtube.com/watch?v=VIDEO_ID
```

**Supported URL formats**
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`

**Success Response (200)**
```json
{
  "success": true,
  "videoId": "tPEE9ZwTmy0",
  "title": "Shortest Video on Youtube",
  "duration": "1",
  "thumbnail": "https://i.ytimg.com/vi_webp/tPEE9ZwTmy0/maxresdefault.webp",
  "author": "Mylo the Cat",
  "downloadUrl": "http://localhost:3000/api/download/ezfsurv4pxeml691bp5",
  "downloadWithFormat": "http://localhost:3000/api/download/ezfsurv4pxeml691bp5?format=FORMAT_ID",
  "formats": [
    {
      "formatId": "251",
      "quality": "audio",
      "container": "webm",
      "hasVideo": false,
      "hasAudio": true
    },
    {
      "formatId": "140",
      "quality": "140p",
      "container": "mp4",
      "hasVideo": true,
      "hasAudio": false
    },
    {
      "formatId": "248",
      "quality": "480p",
      "container": "webm",
      "hasVideo": true,
      "hasAudio": false
    }
  ]
}
```

**Error Response (400)**
```json
{
  "success": false,
  "error": "YouTube URL is required. Send JSON body: {\"url\": \"https://youtube.com/...\"} with header Content-Type: application/json"
}
```

**Error Response (400)**
```json
{
  "success": false,
  "error": "Invalid YouTube URL"
}
```

---

### 3. Download Video

Download the video file. Use the token from the process response.

| Method | Endpoint | Description |
|--------|----------|--------------|
| GET | `/api/download/:token` | Stream video file |

**Request**
```http
GET /api/download/ezfsurv4pxeml691bp5
```

**With format selection**
```http
GET /api/download/ezfsurv4pxeml691bp5?format=best
```

| Query Param | Type | Description |
|-------------|------|-------------|
| `format` | string | Format preset or `formatId` from formats array. Default: `best` |

**Format presets**
| Value | Description |
|-------|-------------|
| `best` | Best quality (default) |
| `bestaudio` | Best audio only |
| `bestvideo` | Best video only |

**Format IDs** – Use `formatId` from the `formats` array in the process response, e.g. `140`, `248`, `251`, `22`.

**Success** – Returns the video/audio file as a stream with `Content-Disposition: attachment`.

**Error Response (404)**
```json
{
  "success": false,
  "error": "Download link expired or invalid"
}
```

**Error Response (410)**
```json
{
  "success": false,
  "error": "Download link has expired"
}
```

> **Note:** Download tokens expire after 10 minutes. Call `/api/process` again to get a new token.

---

## Integration Flow

```
┌─────────────┐     POST /api/process      ┌─────────────┐
│   Frontend  │ ─────────────────────────► │   VIXO API  │
│             │     { "url": "..." }       │             │
└─────────────┘                            └──────┬──────┘
       │                                          │
       │◄─────────────────────────────────────────┘
       │     { downloadUrl, formats, ... }
       │
       │     GET /api/download/TOKEN
       │     (or with ?format=140)
       ▼
┌─────────────┐                            ┌─────────────┐
│   User      │ ◄───────────────────────── │   VIXO API  │
│   downloads │     video/audio file        │   streams   │
└─────────────┘                            └─────────────┘
```

---

## Code Examples

### JavaScript (Fetch)

```javascript
// 1. Process URL
const processRes = await fetch('http://localhost:3000/api/process', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=tPEE9ZwTmy0' }),
});
const data = await processRes.json();

if (data.success) {
  // 2a. Redirect to download (best quality)
  window.location.href = data.downloadUrl;

  // 2b. Or download with specific format
  const formatId = data.formats.find(f => f.quality === '480p')?.formatId;
  window.location.href = `${data.downloadUrl.replace(/\/[^/]+$/, '')}/${data.downloadUrl.split('/').pop()}?format=${formatId}`;
}
```

### cURL

```bash
# Process
curl -X POST http://localhost:3000/api/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=tPEE9ZwTmy0"}'

# Download (replace TOKEN with token from response)
curl -O -J "http://localhost:3000/api/download/TOKEN"

# Download audio only
curl -O -J "http://localhost:3000/api/download/TOKEN?format=bestaudio"
```

### PowerShell

```powershell
# Process
$body = '{"url": "https://www.youtube.com/watch?v=tPEE9ZwTmy0"}'
$res = Invoke-RestMethod -Uri "http://localhost:3000/api/process" -Method Post -Body $body -ContentType "application/json"
$res.downloadUrl

# Download
Invoke-WebRequest -Uri $res.downloadUrl -OutFile "video.mp4" -UseBasicParsing
```

---

## CORS

CORS is enabled for all origins. Configure if you need to restrict origins in production.

---

## Error Handling

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad request (missing/invalid URL) |
| 404 | Token not found |
| 410 | Token expired |
| 500 | Server error (e.g. yt-dlp failure) |

All error responses follow:
```json
{
  "success": false,
  "error": "Error message"
}
```
