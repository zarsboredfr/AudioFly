const express = require('express')
const ytdlp = require('yt-dlp-exec')
const ffmpegPath = require('ffmpeg-static')
const fs = require('fs')
const path = require('path')
const app = express()
const apiKeysFile = path.join(__dirname, 'api-keys.json')
let apiKeys = []
function loadKeys() {
  if (fs.existsSync(apiKeysFile)) {
    try {
      apiKeys = JSON.parse(fs.readFileSync(apiKeysFile, 'utf8'))
    } catch (error) {
      apiKeys = []
    }
  }
}
function saveKeys() {
  fs.writeFileSync(apiKeysFile, JSON.stringify(apiKeys, null, 2))
}
function sanitizeTitle(value) {
  return (value || '')
    .normalize('NFKD')
    .replace(/[^\u0001-\u007f]+/g, '')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/[\x00-\x1F\x7F]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}
function isYoutubeUrl(url) {
  return typeof url === 'string' && /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/i.test(url)
}
function generateApiKey() {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
}
function findApiKey(key) {
  return apiKeys.find(entry => entry.key === key)
}
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))
loadKeys()
app.post('/api/create-key', (req, res) => {
  const name = String(req.body.name || 'developer').trim().slice(0, 40)
  const key = generateApiKey()
  apiKeys.push({ name, key, createdAt: new Date().toISOString() })
  saveKeys()
  res.json({ name, key })
})
async function streamDownload(videoUrl, res, outputType = 'attachment') {
  let info
  try {
    info = await ytdlp(videoUrl, {
      dumpSingleJson: true,
      noWarnings: true,
      skipDownload: true,
      noCheckCertificate: true
    })
  } catch (error) {
    console.error('yt-dlp info error:', error)
    return false
  }
  const title = sanitizeTitle(info.title || 'AudioFly') || 'AudioFly'
  const fallback = 'AudioFly.mp3'
  const filename = `${title}.mp3`
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  )
  res.setHeader('Content-Type', 'audio/mpeg')
  const audioProcess = ytdlp.exec(
    videoUrl,
    {
      noPlaylist: true,
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: '0',
      output: '-',
      quiet: true,
      noWarnings: true,
      noCheckCertificate: true,
      ffmpegLocation: ffmpegPath
    },
    {
      stdout: 'pipe',
      stderr: 'pipe'
    }
  )
  audioProcess.stderr.on('data', chunk => {
    console.error('yt-dlp stderr:', chunk.toString())
  })
  audioProcess.on('error', error => {
    console.error('yt-dlp process error:', error)
    if (!res.headersSent) {
      res.status(500).send('Audio conversion failed')
    }
  })
  audioProcess.on('close', (code, signal) => {
    if (code !== 0 && !res.headersSent) {
      res.status(500).send('Audio conversion failed')
    }
    if (signal) {
      console.error('yt-dlp killed with signal:', signal)
    }
  })
  res.on('close', () => {
    if (!audioProcess.killed) {
      audioProcess.kill()
    }
  })
  audioProcess.stdout.pipe(res)
  return true
}
app.get('/api/download', async (req, res) => {
  const videoUrl = req.query.url
  const apiKey = req.query.key
  if (!videoUrl || !isYoutubeUrl(videoUrl)) {
    return res.status(400).json({ error: 'Invalid YouTube URL' })
  }
  if (!apiKey || !findApiKey(apiKey)) {
    return res.status(401).json({ error: 'Invalid API key' })
  }
  const success = await streamDownload(videoUrl, res)
  if (!success && !res.headersSent) {
    res.status(500).json({ error: 'Unable to process download' })
  }
})
app.get('/download', async (req, res) => {
  const videoUrl = req.query.url
  if (!videoUrl || !isYoutubeUrl(videoUrl)) {
    return res.status(400).send('Invalid YouTube URL')
  }
  const success = await streamDownload(videoUrl, res)
  if (!success && !res.headersSent) {
    res.status(500).send('Unable to process download')
  }
})
const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`AudioFly running on http://localhost:${port}`)
})
