const express = require('express')
const ytdlp = require('yt-dlp-exec')
const ffmpegPath = require('ffmpeg-static')
const path = require('path')
const app = express()

function sanitizeTitle(value) {
  return (value || 'AudioFly')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-_()[\]]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'AudioFly'
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
    if (!res.headersSent) {
      res.status(500).send('Failed to fetch video info')
    }
    return false
  }

  const title = sanitizeTitle(info.title || 'AudioFly')
  const filename = `${title}.mp3`

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  )
  res.setHeader('Content-Type', 'audio/mpeg')
  res.setHeader('Cache-Control', 'no-cache')

  try {
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
        ffmpegLocation: ffmpegPath,
        preferFreeFormats: true,
        ignoreErrors: true
      },
      {
        stdout: 'pipe',
        stderr: 'pipe'
      }
    )

    let errorOutput = ''

    audioProcess.stderr.on('data', chunk => {
      const text = chunk.toString()
      errorOutput += text
      console.error('yt-dlp stderr:', text)
    })

    audioProcess.on('error', error => {
      console.error('Process error:', error)
      if (!res.headersSent) {
        res.status(500).send('Audio conversion failed')
      }
    })

    audioProcess.on('close', code => {
      if (code !== 0 && !res.headersSent) {
        console.error(`yt-dlp exited with code ${code}`)
        console.error(errorOutput)
        res.status(500).send('Download failed (yt-dlp error)')
      }
    })

    res.on('close', () => {
      if (!audioProcess.killed) {
        audioProcess.kill('SIGKILL')
      }
    })

    res.on('error', () => {
      if (!audioProcess.killed) {
        audioProcess.kill('SIGKILL')
      }
    })

    audioProcess.stdout.pipe(res)
    return true
  } catch (err) {
    console.error('Unexpected error in streamDownload:', err)
    if (!res.headersSent) {
      res.status(500).send('Internal server error')
    }
    return false
  }
}

app.get('/download', async (req, res) => {
  const videoUrl = req.query.url
  if (!videoUrl || !isYoutubeUrl(videoUrl)) {
    return res.status(400).send('Invalid YouTube URL')
  }

  console.log(`[DOWNLOAD] ${videoUrl}`)
  try {
    const success = await streamDownload(videoUrl, res)
    if (!success && !res.headersSent) {
      res.status(500).send('Unable to process download')
    }
  } catch (error) {
    console.error('Unhandled download error:', error)
    if (!res.headersSent) {
      res.status(500).send('Server error during download')
    }
  }
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`AudioFly running on http://localhost:${port}`)
})
