const express = require('express')
const ytdlp = require('yt-dlp-exec')
const ffmpegPath = require('ffmpeg-static')
const path = require('path')
const app = express()

function sanitizeTitle(value) {
  return (value || '')
    .normalize('NFKD')
    .replace(/[^-]+/g, '')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/[\x00-\x1F\x7F]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function isYoutubeUrl(url) {
  return typeof url === 'string' && /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/i.test(url)
}

app.use(express.static(path.join(__dirname, 'public')))

app.get('/status', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

app.get('/debug', async (req, res) => {
  const videoUrl = req.query.url
  if (!videoUrl || !isYoutubeUrl(videoUrl)) {
    return res.status(400).json({ status: 'error', message: 'Invalid YouTube URL' })
  }

  try {
    const info = await fetchVideoInfo(videoUrl)
    return res.json({
      status: 'ok',
      title: info.title || 'Unknown title',
      uploader: info.uploader || 'Unknown uploader',
      duration: info.duration || null,
      webpage_url: info.webpage_url || videoUrl
    })
  } catch (error) {
    console.error('yt-dlp debug error:', error)
    return res.status(500).json({ status: 'error', message: String(error.message || error) })
  }
})

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`)
  next()
})

async function fetchVideoInfo(videoUrl) {
  return ytdlp(videoUrl, {
    dumpSingleJson: true,
    noWarnings: true,
    skipDownload: true,
    noCheckCertificate: true
  })
}

async function streamDownload(videoUrl, res) {
  let info
  try {
    info = await fetchVideoInfo(videoUrl)
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

  res.on('error', () => {
    if (!audioProcess.killed) {
      audioProcess.kill()
    }
  })

  audioProcess.stdout.pipe(res)
  return true
}

app.get('/download', async (req, res) => {
  const videoUrl = req.query.url
  if (!videoUrl || !isYoutubeUrl(videoUrl)) {
    return res.status(400).send('Invalid YouTube URL')
  }

  console.log(`Starting download for ${videoUrl}`)
  const success = await streamDownload(videoUrl, res)
  if (!success && !res.headersSent) {
    res.status(500).send('Unable to process download')
  }
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`AudioFly running on http://localhost:${port}`)
})
