const express = require('express')
const ytdlp = require('yt-dlp-exec')
const ffmpegPath = require('ffmpeg-static')
const path = require('path')
const app = express()

const cookiesFromBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER
const cookiesFile = process.env.YTDLP_COOKIES

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

function buildYtdlpOptions({ extractAudio = false, output = '-', skipDownload = false } = {}) {
  const opts = {
    noWarnings: true,
    noCheckCertificate: true,
    quiet: true
  }

  if (skipDownload) {
    opts.skipDownload = true
  }

  if (extractAudio) {
    opts.extractAudio = true
    opts.audioFormat = 'mp3'
    opts.audioQuality = '0'
    opts.output = output
    opts.preferFreeFormats = true
    opts.ignoreErrors = true
  }

  if (cookiesFromBrowser) {
    opts.cookiesFromBrowser = cookiesFromBrowser
  }
  if (cookiesFile) {
    opts.cookies = cookiesFile
  }

  return opts
}

function getYtdlpErrorMessage(error) {
  const message = String(error.stderr || error.message || error || '')
  if (/sign in to confirm you(?:’|')re not a bot/i.test(message)) {
    return 'YouTube blocked this video and requires browser cookies. Set YTDLP_COOKIES_FROM_BROWSER or YTDLP_COOKIES, or try a different video.'
  }
  return message || 'Unknown yt-dlp error'
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
    return res.status(500).json({
      status: 'error',
      message: getYtdlpErrorMessage(error)
    })
  }
})

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`)
  next()
})

async function fetchVideoInfo(videoUrl) {
  return ytdlp(videoUrl, {
    dumpSingleJson: true,
    ...buildYtdlpOptions({ skipDownload: true })
  })
}

async function streamDownload(videoUrl, res) {
  let info
  try {
    info = await fetchVideoInfo(videoUrl)
  } catch (error) {
    const message = getYtdlpErrorMessage(error)
    console.error('yt-dlp info error:', message)
    if (!res.headersSent) {
      res.status(500).send(message)
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
        ...buildYtdlpOptions({ extractAudio: true, output: '-' }),
        noPlaylist: true,
        ffmpegLocation: ffmpegPath
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
